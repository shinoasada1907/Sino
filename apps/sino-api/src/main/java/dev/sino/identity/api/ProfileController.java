package dev.sino.identity.api;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.identity.CurrentUser;
import dev.sino.identity.application.ProfileService;

/**
 * The profile of the signed-in user (change {@code profile-info}, spec {@code user-profile-api}).
 */
@RestController
@RequestMapping("/api/profile")
class ProfileController {

    private final ProfileService profiles;
    private final CurrentUser currentUser;

    ProfileController(ProfileService profiles, CurrentUser currentUser) {
        this.profiles = profiles;
        this.currentUser = currentUser;
    }

    @GetMapping
    ProfileResponse get() {
        return ProfileResponse.from(profiles.get(currentUser.requireOwnerId()));
    }

    @PatchMapping
    ProfileResponse update(@Valid @RequestBody UpdateProfileRequest request) {
        return ProfileResponse.from(profiles.update(currentUser.requireOwnerId(), request.toChange()));
    }

}
