package dev.sino.identity.application;

import java.util.Locale;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The single Sino user of the MVP (D-10). Email and display name are required, so a missing one stops the startup.
 * The email is trimmed and lower-cased because it is the key of the upsert and of the login. The password (D-33)
 * is checked and hashed by {@link LoginSettings}, not here: a Bean Validation failure prints the rejected value.
 */
@Validated
@ConfigurationProperties("sino.owner")
record OwnerProperties(@NotBlank @Email @Size(max = 320) String email,
        @NotBlank @Size(max = 200) String displayName, String password) {

    OwnerProperties {
        email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
        displayName = displayName == null ? null : displayName.trim();
    }

    @Override
    public String toString() {
        return "OwnerProperties[email=" + email + ", displayName=" + displayName + ", password=****]";
    }

}
