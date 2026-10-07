package dev.sino.account;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * The status of an account really changed, for example CONNECTED to DISABLED. Published in the same transaction as
 * the change; never for an action that left the status as it was.
 */
public record AccountStatusChanged(UUID accountId, AccountStatus from, AccountStatus to, Instant occurredAt) {

    public AccountStatusChanged {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(from, "from must not be null");
        Objects.requireNonNull(to, "to must not be null");
        Objects.requireNonNull(occurredAt, "occurredAt must not be null");
    }

}
