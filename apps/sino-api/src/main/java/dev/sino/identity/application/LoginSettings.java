package dev.sino.identity.application;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.security.GeneralSecurityException;
import java.util.Base64;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * What the owner (D-33) and the optional admin (D-261) sign in with, and the key of the remember-me cookie (D-34),
 * checked once at startup: a missing or short value stops the application. The passwords themselves are not kept:
 * sign-in compares with their BCrypt hashes, and the remember-me cookie is signed with an HMAC of the owner's (see
 * {@link #rememberMeFingerprint()}). The checks live here, not in Bean Validation, because a Bean Validation failure
 * prints the rejected value.
 */
@Component
class LoginSettings {

    static final int MIN_PASSWORD_LENGTH = 12;
    static final int MIN_REMEMBER_ME_KEY_LENGTH = 32;

    private static final String ADMIN_EMAIL = "sino.admin.email (SINO_ADMIN_EMAIL)";
    private static final String ADMIN_PASSWORD = "sino.admin.password (SINO_ADMIN_PASSWORD)";

    private final String ownerEmail;
    private final String passwordHash;
    private final String rememberMeKey;
    private final String rememberMeFingerprint;
    private final String adminEmail;
    private final String adminPasswordHash;

    LoginSettings(OwnerProperties owner, AuthProperties auth, AdminProperties admin,
            PasswordEncoder passwordEncoder) {
        requireLength(owner.password(), MIN_PASSWORD_LENGTH, "sino.owner.password (SINO_OWNER_PASSWORD)");
        requireLength(auth.rememberMeKey(), MIN_REMEMBER_ME_KEY_LENGTH,
                "sino.auth.remember-me-key (SINO_REMEMBER_ME_KEY)");
        this.ownerEmail = owner.email();
        this.passwordHash = passwordEncoder.encode(owner.password());
        this.rememberMeKey = auth.rememberMeKey();
        this.rememberMeFingerprint = hmacSha256(auth.rememberMeKey(), owner.password());
        this.adminEmail = checkedAdminEmail(admin, owner.email());
        this.adminPasswordHash = adminEmail == null ? null : passwordEncoder.encode(admin.password());
    }

    /** Trimmed and lower-cased, like the email of the owner user. */
    String ownerEmail() {
        return ownerEmail;
    }

    /** BCrypt hash with its {@code {bcrypt}} prefix, as {@link PasswordEncoder#matches} expects. */
    String passwordHash() {
        return passwordHash;
    }

    String rememberMeKey() {
        return rememberMeKey;
    }

    /**
     * Stands for the password in the remember-me signature: an HMAC-SHA256 of the password under the remember-me
     * key. The BCrypt hash cannot be used, because its random salt makes it different after every restart and the
     * cookie would stop working (D-34). This value stays the same across restarts and changes with the password or
     * the key, which signs every browser out.
     */
    String rememberMeFingerprint() {
        return rememberMeFingerprint;
    }

    /** Trimmed and lower-cased; empty when no admin is configured. */
    Optional<String> adminEmail() {
        return Optional.ofNullable(adminEmail);
    }

    /** BCrypt hash of the admin password; {@code null} when there is no admin. */
    String adminPasswordHash() {
        return adminPasswordHash;
    }

    @Override
    public String toString() {
        return "LoginSettings[ownerEmail=" + ownerEmail + ", adminEmail=" + adminEmail
                + ", passwordHash=****, rememberMeKey=****, rememberMeFingerprint=****, adminPasswordHash=****]";
    }

    // A password without an email is a half-done configuration, not "no admin": it stops the startup too.
    private static String checkedAdminEmail(AdminProperties admin, String ownerEmail) {
        if (admin.email() == null) {
            if (admin.password() != null && !admin.password().isBlank()) {
                throw new IllegalStateException(ADMIN_EMAIL + " must be set when " + ADMIN_PASSWORD + " is");
            }
            return null;
        }
        if (admin.email().equals(ownerEmail)) {
            throw new IllegalStateException(ADMIN_EMAIL + " must differ from sino.owner.email (SINO_OWNER_EMAIL)");
        }
        requireLength(admin.password(), MIN_PASSWORD_LENGTH, ADMIN_PASSWORD);
        return admin.email();
    }

    private static String hmacSha256(String key, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(UTF_8), "HmacSHA256"));
            return Base64.getEncoder().encodeToString(mac.doFinal(value.getBytes(UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 is not available", e);
        }
    }

    // The message names the setting only, never the value.
    private static void requireLength(String value, int minLength, String setting) {
        if (value == null || value.isBlank() || value.codePointCount(0, value.length()) < minLength) {
            throw new IllegalStateException(setting + " must be set and at least " + minLength + " characters long");
        }
    }

}
