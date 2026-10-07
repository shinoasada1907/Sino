package dev.sino.account.application;

import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.ProviderCredentials;

/**
 * What the connect flow (F04) knows once the provider has confirmed an account: who connects it, the provider, the
 * account as the provider describes it, and its credential. {@code refreshToken} is optional and only for OAuth2,
 * whose {@link dev.sino.provider.spi.OAuth2Credentials} does not carry it.
 */
public record RegisterAccountCommand(UUID ownerId, ProviderType provider, AccountProfile profile,
        ProviderCredentials credentials, String refreshToken) {

    public RegisterAccountCommand {
        Objects.requireNonNull(ownerId, "ownerId must not be null");
        Objects.requireNonNull(provider, "provider must not be null");
        Objects.requireNonNull(profile, "profile must not be null");
        Objects.requireNonNull(credentials, "credentials must not be null");
    }

    @Override
    public String toString() {
        return "RegisterAccountCommand[ownerId=" + ownerId + ", provider=" + provider + ", profile=" + profile
                + ", credentials=" + credentials + ", refreshToken=" + (refreshToken == null ? null : "****") + "]";
    }

}
