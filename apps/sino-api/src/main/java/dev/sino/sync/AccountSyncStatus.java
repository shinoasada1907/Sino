package dev.sino.sync;

import java.time.Instant;
import java.util.Objects;

/**
 * Where the reading of an account stands. {@code importStatus}: {@code NONE} (never started), {@code RUNNING},
 * {@code DONE} or {@code FAILED}, with {@code importError} the code it failed with. {@code lastSyncAt}: the last
 * successful sync after the import; {@code syncError}: the code the last sync failed with, {@code null} once one
 * succeeds. {@code push}: whether the provider notifies Sino of changes, {@code ACTIVE}, {@code FAILED} or
 * {@code OFF}, as in the sync API of the owner. Error codes are Sino's own; they never carry mail.
 */
public record AccountSyncStatus(String importStatus, String importError, Instant lastSyncAt, String syncError,
        String push) {

    /** An account whose import never started. */
    public static final AccountSyncStatus NEVER_IMPORTED = new AccountSyncStatus("NONE", null, null, null, "OFF");

    public AccountSyncStatus {
        Objects.requireNonNull(importStatus, "importStatus must not be null");
        Objects.requireNonNull(push, "push must not be null");
    }

    /** The import failed, the last sync failed, or the notices of the provider could not be turned on. */
    public boolean failing() {
        return "FAILED".equals(importStatus) || syncError != null || "FAILED".equals(push);
    }

}
