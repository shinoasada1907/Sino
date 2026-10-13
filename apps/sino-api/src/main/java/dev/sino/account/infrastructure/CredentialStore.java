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
 * ciphertext. Internal to the account module: other modules reach a connector through
 * {@link dev.sino.account.ProviderAccess} and never see a credential (D-62).
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
        write(row, credential, refreshToken);
        credentials.save(row);
    }

    /** The decrypted credential, for one call to a connector. Empty when the account has none. */
    @Transactional(readOnly = true)
    public Optional<ProviderCredentials> load(UUID accountId) {
        return credentials.findByAccountId(accountId).map(this::credentialOf);
    }

    /** The decrypted credential with its refresh token and the version it was read at. Empty when there is none. */
    @Transactional(readOnly = true)
    public Optional<CredentialSnapshot> snapshot(UUID accountId) {
        return credentials.findByAccountId(accountId).map(row -> new CredentialSnapshot(credentialOf(row),
                row.refreshToken().map(refresh -> cipher.decrypt(refresh, accountId, REFRESH_TOKEN)).orElse(null),
                row.id(), row.version()));
    }

    /**
     * Stores what a refresh produced, unless the stored credential is no longer the one {@code read} saw: a
     * reconnect or another refresh wrote a newer one, or the account was removed. Then nothing is written. A write
     * between this check and the commit ends in an {@link org.springframework.dao.OptimisticLockingFailureException}.
     */
    @Transactional
    public void replaceIfUnchanged(UUID accountId, CredentialSnapshot read, OAuth2Credentials credential,
            String refreshToken) {
        credentials.findByAccountId(accountId).filter(row -> isSame(row, read)).ifPresent(row -> {
            write(row, credential, refreshToken);
            credentials.save(row);
        });
    }

    /** Whether the stored credential is still the one {@code read} saw: same row, not written since. */
    @Transactional(readOnly = true)
    public boolean isCurrent(UUID accountId, CredentialSnapshot read) {
        return credentials.findByAccountId(accountId).filter(row -> isSame(row, read)).isPresent();
    }

    /** The decrypted refresh token of an OAuth2 credential, for revoking it. Empty when there is none. */
    @Transactional(readOnly = true)
    public Optional<String> refreshToken(UUID accountId) {
        return credentials.findByAccountId(accountId).flatMap(AccountCredential::refreshToken)
                .map(refresh -> cipher.decrypt(refresh, accountId, REFRESH_TOKEN));
    }

    /** The scopes the account granted, read without decrypting anything; empty without a credential. */
    @Transactional(readOnly = true)
    public Set<String> grantedScopes(UUID accountId) {
        return credentials.findByAccountId(accountId).map(row -> Set.copyOf(row.scopes())).orElse(Set.of());
    }

    @Transactional
    public void delete(UUID accountId) {
        credentials.deleteByAccountId(accountId);
    }

    private void write(AccountCredential row, ProviderCredentials credential, String refreshToken) {
        UUID accountId = row.accountId();
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
    }

    private static boolean isSame(AccountCredential row, CredentialSnapshot read) {
        return row.id().equals(read.credentialId()) && row.version() == read.version();
    }

    private ProviderCredentials credentialOf(AccountCredential row) {
        EncryptedValue access = row.accessToken();
        String accessToken = cipher.decrypt(access, row.accountId(), ACCESS_TOKEN);
        return switch (row.type()) {
            case OAUTH2 -> new OAuth2Credentials(accessToken, row.expiresAt(), Set.copyOf(row.scopes()));
            case TOKEN -> new TokenCredentials(accessToken);
        };
    }

}
