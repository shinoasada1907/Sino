package dev.sino.admin.api;

import java.time.Instant;
import java.util.Map;

import dev.sino.admin.application.Overview;

/** Body of {@code GET /api/admin/overview}. */
record OverviewResponse(Instant generatedAt, long users, long accounts, Map<String, Long> accountsByStatus,
        long accountsWithSyncErrors, long storedMessages) {

    static OverviewResponse from(Instant generatedAt, Overview overview) {
        return new OverviewResponse(generatedAt, overview.users(), overview.accounts(), overview.accountsByStatus(),
                overview.accountsWithSyncErrors(), overview.storedMessages());
    }

}
