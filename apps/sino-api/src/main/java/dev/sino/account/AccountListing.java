package dev.sino.account;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.ProviderType;

/**
 * One account as the person who runs Sino sees it: whose it is, its provider, address and status, whether it syncs on
 * its own, and when it was connected. No credential, no provider ID; {@code address} is {@code null} for a provider
 * without one.
 */
public record AccountListing(UUID id, UUID ownerId, ProviderType provider, AccountStatus status, String address,
        boolean syncEnabled, Instant createdAt) {

    public AccountListing {
        Objects.requireNonNull(id, "id must not be null");
        Objects.requireNonNull(ownerId, "ownerId must not be null");
        Objects.requireNonNull(provider, "provider must not be null");
        Objects.requireNonNull(status, "status must not be null");
        Objects.requireNonNull(createdAt, "createdAt must not be null");
    }

}
