package dev.sino.identity.application;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.common.error.SinoException;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.identity.infrastructure.UserAvatar;
import dev.sino.identity.infrastructure.UserAvatarRepository;

/**
 * Reads and edits the profile of a user and keeps its picture (change {@code profile-info}). The limits of the fields
 * live in {@link AppUser#updateProfile}, so the request check and this service cannot disagree.
 */
@Service
public class ProfileService {

    /** How many bytes of the digest, as hex characters, the picture's address carries. */
    private static final int VERSION_HEX_LENGTH = 8;

    private final AppUserRepository users;
    private final UserAvatarRepository avatars;
    private final Clock clock;

    ProfileService(AppUserRepository users, UserAvatarRepository avatars, Clock clock) {
        this.users = users;
        this.avatars = avatars;
        this.clock = clock;
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

    /**
     * Keeps {@code content} as the picture of the user, in place of the old one, and gives the profile back. The type
     * comes from the bytes. Nothing changes when it throws.
     *
     * @throws SinoException {@code AVATAR_TOO_LARGE} above {@link AvatarImage#MAX_BYTES}
     * @throws IllegalArgumentException when the bytes are not a PNG, JPEG or WebP within {@link AvatarImage#MAX_SIDE}
     */
    @Transactional
    public Profile replaceAvatar(UUID userId, byte[] content) {
        if (content.length > AvatarImage.MAX_BYTES) {
            throw new SinoException(IdentityErrorCode.AVATAR_TOO_LARGE,
                    "The picture is at most " + AvatarImage.MAX_BYTES / 1024 + " KB.");
        }
        AvatarImage image = AvatarImage.read(content);
        AppUser user = users.findById(userId).orElseThrow(ProfileService::noSuchUser);
        byte[] sha256 = sha256Of(content);
        UserAvatar avatar = avatars.findById(userId).orElse(null);
        if (avatar == null) {
            avatars.saveAndFlush(new UserAvatar(userId, content, image.contentType(), sha256, clock.instant()));
        } else {
            avatar.replace(content, image.contentType(), sha256, clock.instant());
            avatars.saveAndFlush(avatar);
        }
        return profileOf(user);
    }

    /** Removes the picture; nothing to do when there is none. */
    @Transactional
    public void removeAvatar(UUID userId) {
        avatars.deleteByUserId(userId);
    }

    /** The ETag of the picture, without reading its bytes; empty when the user has none. */
    @Transactional(readOnly = true)
    public Optional<String> avatarEtag(UUID userId) {
        return avatars.findSha256ByUserId(userId).map(ProfileService::etagOf);
    }

    @Transactional(readOnly = true)
    public Optional<AvatarPicture> avatar(UUID userId) {
        return avatars.findById(userId)
                .map(avatar -> new AvatarPicture(avatar.contentType(), avatar.content(), etagOf(avatar.sha256())));
    }

    private Profile profileOf(AppUser user) {
        String avatarUrl = avatars.findSha256ByUserId(user.id())
                .map(sha256 -> "/api/profile/avatar?v=" + HexFormat.of().formatHex(sha256).substring(0, VERSION_HEX_LENGTH))
                .orElse(null);
        return new Profile(user.email(), user.displayName(), user.phoneNumber(), user.jobTitle(), user.location(),
                user.bio(), user.createdAt(), avatarUrl);
    }

    private static String keep(String given, String current) {
        return given != null ? given : current;
    }

    private static String etagOf(byte[] sha256) {
        return "\"" + HexFormat.of().formatHex(sha256) + "\"";
    }

    private static byte[] sha256Of(byte[] content) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(content);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("Every Java platform has SHA-256.", e);
        }
    }

    private static AuthenticationCredentialsNotFoundException noSuchUser() {
        return new AuthenticationCredentialsNotFoundException("No such user");
    }

}
