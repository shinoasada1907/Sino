package dev.sino.identity.application;

import java.util.UUID;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;

/**
 * Reads and edits the profile of a user (change {@code profile-info}). The limits of the fields live in
 * {@link AppUser#updateProfile}, so the request check and this service cannot disagree.
 */
@Service
public class ProfileService {

    private final AppUserRepository users;

    ProfileService(AppUserRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public Profile get(UUID userId) {
        return profileOf(users.findById(userId).orElseThrow(ProfileService::noSuchUser));
    }

    /** The signed-in user by the name of its authentication (the owner's email). */
    @Transactional(readOnly = true)
    public Profile getByEmail(String email) {
        return profileOf(users.findByEmail(email).orElseThrow(ProfileService::noSuchUser));
    }

    /**
     * Changes the fields {@code change} gives and keeps the others. Nothing is written when it throws.
     *
     * @throws IllegalArgumentException when a value breaks a limit of {@link AppUser#updateProfile}
     */
    @Transactional
    public Profile update(UUID userId, ProfileChange change) {
        AppUser user = users.findById(userId).orElseThrow(ProfileService::noSuchUser);
        user.updateProfile(
                keep(change.displayName(), user.displayName()),
                keep(change.phoneNumber(), user.phoneNumber()),
                keep(change.jobTitle(), user.jobTitle()),
                keep(change.location(), user.location()),
                keep(change.bio(), user.bio()));
        return profileOf(users.saveAndFlush(user));
    }

    private static String keep(String given, String current) {
        return given != null ? given : current;
    }

    private static Profile profileOf(AppUser user) {
        // The picture comes with PI-03: until then no user has one.
        return new Profile(user.email(), user.displayName(), user.phoneNumber(), user.jobTitle(), user.location(),
                user.bio(), user.createdAt(), null);
    }

    private static AuthenticationCredentialsNotFoundException noSuchUser() {
        return new AuthenticationCredentialsNotFoundException("No such user");
    }

}
