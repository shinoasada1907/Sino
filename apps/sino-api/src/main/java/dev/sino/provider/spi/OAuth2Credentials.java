package dev.sino.provider.spi;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;

/**
 * An OAuth2 access token, for example Gmail's. {@code expiresAt} is optional; {@code scopes} are the scopes
 * the user granted.
 */
public record OAuth2Credentials(String accessToken, Instant expiresAt, Set<String> scopes)
        implements ProviderCredentials {

    public OAuth2Credentials {
        if (accessToken == null || accessToken.isBlank()) {
            throw new IllegalArgumentException("accessToken must not be blank");
        }
        scopes = Set.copyOf(Objects.requireNonNull(scopes, "scopes must not be null"));
    }

    @Override
    public String toString() {
        return "OAuth2Credentials[accessToken=****, expiresAt=" + expiresAt + ", scopes=" + scopes + "]";
    }

}
