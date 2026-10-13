package dev.sino.identity.application;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The optional admin (D-260, D-261): a person who runs Sino, not a Sino user, so no {@code app_user}. An empty email
 * means there is no admin. The email is trimmed and lower-cased like the owner's; the password is checked and hashed
 * by {@link LoginSettings}, not here, because a Bean Validation failure prints the rejected value.
 */
@Validated
@ConfigurationProperties("sino.admin")
record AdminProperties(@Email @Size(max = 320) String email, String password) {

    AdminProperties {
        email = email == null || email.isBlank() ? null : OwnerProperties.normalizeEmail(email);
    }

    @Override
    public String toString() {
        return "AdminProperties[email=" + email + ", password=****]";
    }

}
