package dev.sino.admin.application;

import java.time.Instant;

/** How the reading of an account goes, as the admin API shows it; see {@code dev.sino.sync.AccountSyncStatus}. */
public record SyncView(String importStatus, String importError, Instant lastSyncAt, String syncError, String push) {
}
