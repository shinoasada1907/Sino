package dev.sino.sync;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Where the reading of the account stands changed (F08): a page of the first import was stored, the import ended,
 * or the error of its syncs appeared or went away. Tells the web to read the status again.
 */
public record SyncStateChanged(UUID accountId, Instant changedAt) {

    public SyncStateChanged {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(changedAt, "changedAt must not be null");
    }

}
