package dev.sino.sync;

import java.util.UUID;

/**
 * Where the reading of an account stands, whoever owns it, for the work of the person who runs Sino (admin, D-265).
 * Requests of a user read the status of their own account through the sync API instead.
 */
public interface SyncStatuses {

    /** {@link AccountSyncStatus#NEVER_IMPORTED} for an account whose import never started, or an unknown one. */
    AccountSyncStatus statusOf(UUID accountId);

}
