package dev.sino.admin.application;

import java.time.Instant;
import java.util.UUID;

/** A Sino user as the admin sees it; {@code accounts} counts its connected accounts that are not removed. */
public record UserView(UUID id, String email, String displayName, String status, Instant createdAt, long accounts) {
}
