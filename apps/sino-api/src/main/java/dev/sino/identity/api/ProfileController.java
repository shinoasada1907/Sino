package dev.sino.identity.api;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MultipartFile;

import dev.sino.common.error.SinoException;
import dev.sino.identity.CurrentUser;
import dev.sino.identity.application.AvatarPicture;
import dev.sino.identity.application.IdentityErrorCode;
import dev.sino.identity.application.ProfileService;

/**
 * The profile of the signed-in user and its picture (change {@code profile-info}, spec {@code user-profile-api}).
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

    /** Keeps the file of the part {@code file} as the picture (D-481: the answer is the whole profile). */
    @PutMapping(path = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ProfileResponse putAvatar(@RequestPart("file") @ValidAvatarFile MultipartFile file) {
        return ProfileResponse.from(profiles.replaceAvatar(currentUser.requireOwnerId(), bytesOf(file)));
    }

    /**
     * The bytes of the picture. The address carries {@code ?v=}, but the ETag is what decides: the browser asks again
     * every time ({@code no-cache}) and gets a {@code 304} while the picture is the same.
     */
    @GetMapping("/avatar")
    ResponseEntity<byte[]> getAvatar(WebRequest request) {
        UUID userId = currentUser.requireOwnerId();
        String etag = profiles.avatarEtag(userId).orElseThrow(ProfileController::noAvatar);
        if (request.checkNotModified(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).build();
        }
        AvatarPicture picture = profiles.avatar(userId).orElseThrow(ProfileController::noAvatar);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(picture.contentType()))
                .eTag(picture.etag())
                .cacheControl(CacheControl.noCache().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(picture.content());
    }

    @DeleteMapping("/avatar")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteAvatar() {
        profiles.removeAvatar(currentUser.requireOwnerId());
    }

    private static SinoException noAvatar() {
        return new SinoException(IdentityErrorCode.AVATAR_NOT_FOUND, "There is no picture.");
    }

    private static byte[] bytesOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("The upload could not be read.", e);
        }
    }

}
