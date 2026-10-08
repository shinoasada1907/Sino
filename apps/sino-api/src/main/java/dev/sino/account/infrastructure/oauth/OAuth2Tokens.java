package dev.sino.account.infrastructure.oauth;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;

/**
 * What the token endpoint gave for one code. {@code expiresAt} and {@code refreshToken} are optional;
 * {@code grantedScopes} are the scopes the user really granted.
 */
public record OAuth2Tokens(String accessToken, Instant expiresAt, Set<String> grantedScopes, String refreshToken) {

    public OAuth2Tokens {
        Objects.requireNonNull(accessToken, "accessToken must not be null");
        grantedScopes = Set.copyOf(Objects.requireNonNull(grantedScopes, "grantedScopes must not be null"));
    }

    @Override
    public String toString() {
        return "OAuth2Tokens[accessToken=****, expiresAt=" + expiresAt + ", grantedScopes=" + grantedScopes
                + ", refreshToken=" + (refreshToken == null ? null : "****") + "]";
    }

}
