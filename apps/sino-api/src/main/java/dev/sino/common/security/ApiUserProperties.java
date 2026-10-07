package dev.sino.common.security;

import jakarta.validation.constraints.NotBlank;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The single REST API user of the backend-only phase (D-02 A). Replaced by browser authentication (D-22).
 */
@Validated
@ConfigurationProperties("sino.security.api-user")
record ApiUserProperties(@NotBlank String username, @NotBlank String password) {

    @Override
    public String toString() {
        return "ApiUserProperties[username=" + username + ", password=****]";
    }

}
