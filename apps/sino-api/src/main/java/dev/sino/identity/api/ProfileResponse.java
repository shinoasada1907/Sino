package dev.sino.identity.api;

import java.time.Instant;

import dev.sino.identity.application.Profile;

/**
 * Body of {@code GET} and {@code PATCH /api/profile}. {@code role} is always {@code OWNER} while Sino has one user.
 */
record ProfileResponse(String email, String displayName, String phoneNumber, String jobTitle, String location,
        String bio, String role, Instant joinedAt, String avatarUrl) {

    static ProfileResponse from(Profile profile) {
        return new ProfileResponse(profile.email(), profile.displayName(), profile.phoneNumber(), profile.jobTitle(),
                profile.location(), profile.bio(), "OWNER", profile.joinedAt(), profile.avatarUrl());
    }

}
