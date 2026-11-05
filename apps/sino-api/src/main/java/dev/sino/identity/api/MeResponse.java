package dev.sino.identity.api;

import dev.sino.identity.application.Profile;

/**
 * Body of {@code GET /api/auth/me}: who is signed in. {@code avatarUrl} is the same as in the profile.
 */
record MeResponse(String email, String displayName, String avatarUrl) {

    static MeResponse from(Profile profile) {
        return new MeResponse(profile.email(), profile.displayName(), profile.avatarUrl());
    }

}
