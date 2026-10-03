package dev.sino.account.infrastructure;

import static dev.sino.account.infrastructure.crypto.CredentialField.ACCESS_TOKEN;
import static dev.sino.account.infrastructure.crypto.CredentialField.REFRESH_TOKEN;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.infrastructure.crypto.CredentialCipher;
import dev.sino.account.infrastructure.crypto.EncryptedValue;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderCredentials;
import dev.sino.provider.spi.TokenCredentials;

/**
 * The only way to store or read a credential: encrypts on the way in, decrypts on the way out, and never hands out
 * ciphertext. Internal to the account module (F02 exports no way to read credentials; F07 decides that for sync).
 * There is deliberately no way to change one token: every save rewrites the whole credential with the active key.
 */
@Component
public class CredentialStore {

    private final AccountCredentialRepository credentials;
    private final CredentialCipher cipher;

    CredentialStore(AccountCredentialRepository credentials, CredentialCipher cipher) {
        this.credentials = credentials;
        this.cipher = cipher;
    }

    /**
     * Stores the credential of an account, replacing any previous one. {@code refreshToken} is optional and only
     * allowed with {@link OAuth2Credentials}, which does not carry it (refreshing is F04's job).
     */
    @Transactional
    public void save(UUID accountId, ProviderCredentials credential, String refreshToken) {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(credential, "credential must not be null");
        AccountCredential row = credentials.findByAccountId(accountId)
                .orElseGet(() -> new AccountCredential(accountId));
        switch (credential) {
            case OAuth2Credentials oauth -> row.replace(CredentialType.OAUTH2,
                    cipher.encrypt(oauth.accessToken(), accountId, ACCESS_TOKEN),
                    refreshToken == null ? null : cipher.encrypt(refreshToken, accountId, REFRESH_TOKEN),
                    oauth.expiresAt(), oauth.scopes().stream().sorted().toList());
            case TokenCredentials token -> {
                if (refreshToken != null) {
                    throw new IllegalArgumentException("A TOKEN credential has no refresh token");
                }
                row.replace(CredentialType.TOKEN, cipher.encrypt(token.token(), accountId, ACCESS_TOKEN), null,
                        null, List.of());
            }
        }
        credentials.save(row);
    }

    /** The decrypted credential, for one call to a connector. Empty when the account has none. */
    @Transactional(readOnly = true)
    public Optional<ProviderCredentials> load(UUID accountId) {
        return credentials.findByAccountId(accountId).map(row -> {
            EncryptedValue access = row.accessToken();
            String accessToken = cipher.decrypt(access, accountId, ACCESS_TOKEN);
            return switch (row.type()) {
                case OAUTH2 -> new OAuth2Credentials(accessToken, row.expiresAt(), Set.copyOf(row.scopes()));
                case TOKEN -> new TokenCredentials(accessToken);
            };
        });
    }

    @Transactional
    public void delete(UUID accountId) {
        credentials.deleteByAccountId(accountId);
    }

}
