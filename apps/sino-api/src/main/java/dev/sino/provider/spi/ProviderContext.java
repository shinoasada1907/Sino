package dev.sino.provider.spi;

import java.util.Objects;
import java.util.UUID;

/**
 * Everything a connector needs for one call. {@code accountId} is Sino's id of the connected account;
 * {@code externalAccountId} is {@code null} until the account profile is known.
 */
public record ProviderContext(UUID accountId, String externalAccountId, ProviderCredentials credentials) {

    public ProviderContext {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(credentials, "credentials must not be null");
    }

    @Override
    public String toString() {
        // Delegates to the credentials, which mask their secret.
        return "ProviderContext[accountId=" + accountId + ", externalAccountId=" + externalAccountId
                + ", credentials=" + credentials + "]";
    }

}
