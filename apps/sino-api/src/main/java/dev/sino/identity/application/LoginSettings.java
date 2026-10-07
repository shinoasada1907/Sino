package dev.sino.identity.application;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * What the owner signs in with (D-33) and the key of the remember-me cookie (D-34), checked once at startup: a
 * missing or short value stops the application. Only a BCrypt hash of the password is kept. The checks live here,
 * not in Bean Validation, because a Bean Validation failure prints the rejected value.
 */
@Component
class LoginSettings {

    static final int MIN_PASSWORD_LENGTH = 12;
    static final int MIN_REMEMBER_ME_KEY_LENGTH = 32;

    private final String ownerEmail;
    private final String passwordHash;
    private final String rememberMeKey;

    LoginSettings(OwnerProperties owner, AuthProperties auth, PasswordEncoder passwordEncoder) {
        requireLength(owner.password(), MIN_PASSWORD_LENGTH, "sino.owner.password (SINO_OWNER_PASSWORD)");
        requireLength(auth.rememberMeKey(), MIN_REMEMBER_ME_KEY_LENGTH,
                "sino.auth.remember-me-key (SINO_REMEMBER_ME_KEY)");
        this.ownerEmail = owner.email();
        this.passwordHash = passwordEncoder.encode(owner.password());
        this.rememberMeKey = auth.rememberMeKey();
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

    @Override
    public String toString() {
        return "LoginSettings[ownerEmail=" + ownerEmail + ", passwordHash=****, rememberMeKey=****]";
    }

    // The message names the setting only, never the value.
    private static void requireLength(String value, int minLength, String setting) {
        if (value == null || value.isBlank() || value.codePointCount(0, value.length()) < minLength) {
            throw new IllegalStateException(setting + " must be set and at least " + minLength + " characters long");
        }
    }

}
