package dev.sino.identity.api;

import dev.sino.identity.application.SignInService.OwnerProfile;

/**
 * Body of {@code GET /api/auth/me}: who is signed in.
 */
record MeResponse(String email, String displayName) {

    static MeResponse from(OwnerProfile profile) {
        return new MeResponse(profile.email(), profile.displayName());
    }

}
