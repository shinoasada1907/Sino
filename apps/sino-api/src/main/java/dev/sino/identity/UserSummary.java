package dev.sino.identity;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * What another module may know about a Sino user. {@code status} is {@code ACTIVE} or {@code DISABLED}, as text, so
 * the enum of the user table stays inside this module.
 */
public record UserSummary(UUID id, String email, String displayName, String status, Instant createdAt) {

    public UserSummary {
        Objects.requireNonNull(id, "id must not be null");
        Objects.requireNonNull(email, "email must not be null");
        Objects.requireNonNull(status, "status must not be null");
        Objects.requireNonNull(createdAt, "createdAt must not be null");
    }

}
