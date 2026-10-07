package dev.sino.account;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.ProviderType;

/**
 * The user removed an account (D-13 B: the row is kept and hidden, the credential is deleted). Published in the
 * same transaction. Carries IDs, the provider and the time only.
 */
public record AccountRemoved(UUID accountId, UUID ownerId, ProviderType provider, Instant occurredAt) {

    public AccountRemoved {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(ownerId, "ownerId must not be null");
        Objects.requireNonNull(provider, "provider must not be null");
        Objects.requireNonNull(occurredAt, "occurredAt must not be null");
    }

}
