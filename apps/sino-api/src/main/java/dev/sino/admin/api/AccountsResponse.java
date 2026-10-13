package dev.sino.admin.api;

import java.time.Instant;
import java.util.List;

import dev.sino.admin.application.AccountView;

/** Body of {@code GET /api/admin/accounts}: every connected account that is not removed, oldest first. */
record AccountsResponse(Instant generatedAt, List<AccountView> accounts) {
}
