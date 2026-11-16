package dev.sino.identity.application;

import java.time.Instant;

/**
 * A user's profile as the API shows it (spec {@code user-profile-api}). {@code avatarUrl} is {@code null} when there is
 * no picture; the optional fields are {@code null} when not set.
 */
public record Profile(String email, String displayName, String phoneNumber, String jobTitle, String location,
        String bio, Instant joinedAt, String avatarUrl) {
}
