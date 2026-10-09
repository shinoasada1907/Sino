package dev.sino.account;

import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.ProviderType;

/** What another module may know about an account: no credential, no profile data. */
public record AccountSummary(UUID id, ProviderType provider, AccountStatus status, String externalAccountId) {

    public AccountSummary {
        Objects.requireNonNull(id, "id must not be null");
        Objects.requireNonNull(provider, "provider must not be null");
        Objects.requireNonNull(status, "status must not be null");
        Objects.requireNonNull(externalAccountId, "externalAccountId must not be null");
    }

}
