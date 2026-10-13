package dev.sino.identity.api;

import jakarta.validation.constraints.NotBlank;

/**
 * Body of {@code POST /api/auth/login}. {@code rememberMe} is "keep me signed in on this device"; missing means no.
 * It is a {@code Boolean}, not a {@code boolean}: Jackson 3 refuses a missing value for a primitive.
 */
record LoginRequest(@NotBlank String email, @NotBlank String password, Boolean rememberMe) {

    boolean keepSignedIn() {
        return Boolean.TRUE.equals(rememberMe);
    }

    @Override
    public String toString() {
        return "LoginRequest[email=" + email + ", password=****, rememberMe=" + rememberMe + "]";
    }

}
