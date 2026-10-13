package dev.sino.account.infrastructure;

import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.spi.ProviderCredentials;

/**
 * A decrypted credential as stored in row {@code credentialId} at {@code version}. Both are needed to tell whether
 * it is still the stored one: an account removed and connected again gets a new row, back at the first version.
 * {@code refreshToken} is optional and only for OAuth2.
 */
public record CredentialSnapshot(ProviderCredentials credential, String refreshToken, UUID credentialId,
        long version) {

    public CredentialSnapshot {
        Objects.requireNonNull(credential, "credential must not be null");
        Objects.requireNonNull(credentialId, "credentialId must not be null");
    }

    @Override
    public String toString() {
        return "CredentialSnapshot[credential=" + credential + ", refreshToken="
                + (refreshToken == null ? null : "****") + ", credentialId=" + credentialId + ", version=" + version
                + "]";
    }

}
