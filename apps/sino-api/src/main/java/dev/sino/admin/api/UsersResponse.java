package dev.sino.admin.api;

import java.time.Instant;
import java.util.List;

import dev.sino.admin.application.UserView;

/** Body of {@code GET /api/admin/users}: every Sino user, oldest first. */
record UsersResponse(Instant generatedAt, List<UserView> users) {
}
