package dev.sino.admin.application;

import java.util.Map;

/**
 * The numbers at a glance. {@code accounts} and {@code storedMessages} leave removed accounts out;
 * {@code accountsWithSyncErrors} counts the accounts whose import failed, whose last sync failed, or whose provider
 * notices could not be turned on.
 */
public record Overview(long users, long accounts, Map<String, Long> accountsByStatus, long accountsWithSyncErrors,
        long storedMessages) {
}
