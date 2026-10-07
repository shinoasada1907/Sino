package dev.sino.identity.application;

import java.util.Locale;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The single Sino user of the MVP (D-10). Both values are required, so a missing one stops the startup. The email
 * is trimmed and lower-cased because it is the key of the upsert.
 */
@Validated
@ConfigurationProperties("sino.owner")
record OwnerProperties(@NotBlank @Email @Size(max = 320) String email,
        @NotBlank @Size(max = 200) String displayName) {

    OwnerProperties {
        email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
        displayName = displayName == null ? null : displayName.trim();
    }

}
