package dev.sino.account;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.ProviderType;

/**
 * An account was connected for the first time ({@code reconnected = false}) or connected again ({@code true}).
 * Published in the same transaction as the account and its credential. Carries IDs, the provider, the flag and the
 * time only: never a credential or profile data.
 */
public record AccountConnected(UUID accountId, UUID ownerId, ProviderType provider, boolean reconnected,
        Instant occurredAt) {

    public AccountConnected {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(ownerId, "ownerId must not be null");
        Objects.requireNonNull(provider, "provider must not be null");
        Objects.requireNonNull(occurredAt, "occurredAt must not be null");
    }

}
