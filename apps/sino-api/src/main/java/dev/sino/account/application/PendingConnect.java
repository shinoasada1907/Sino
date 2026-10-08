package dev.sino.account.application;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

/**
 * A connect the user started and the provider has not answered yet. It lives in the browser session; the
 * authorization request keeps the state and the PKCE verifier. {@code accountId} is the account being
 * reconnected, or {@code null} for a new one.
 */
public record PendingConnect(String provider, UUID ownerId, UUID accountId,
        OAuth2AuthorizationRequest authorizationRequest, Instant createdAt) implements Serializable {

    public PendingConnect {
        Objects.requireNonNull(provider, "provider must not be null");
        Objects.requireNonNull(ownerId, "ownerId must not be null");
        Objects.requireNonNull(authorizationRequest, "authorizationRequest must not be null");
        Objects.requireNonNull(createdAt, "createdAt must not be null");
    }

    public String state() {
        return authorizationRequest.getState();
    }

    /** Where the browser goes to give its consent. */
    public String authorizationUrl() {
        return authorizationRequest.getAuthorizationRequestUri();
    }

    // Leaves out the authorization request, whose attributes hold the PKCE verifier.
    @Override
    public String toString() {
        return "PendingConnect[provider=" + provider + ", ownerId=" + ownerId + ", accountId=" + accountId
                + ", createdAt=" + createdAt + "]";
    }

}
