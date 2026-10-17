package dev.sino.account.application;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * A QR connect the user started and has not finished: the provider's {@code loginId} of it, who started it, and, for a
 * reconnect, the account and its id at the provider ({@code null} for a new account). It lives in the browser session
 * (D-275).
 */
public record PendingQrConnect(String provider, UUID ownerId, UUID accountId, String externalAccountId, String loginId,
        Instant createdAt) implements Serializable {

    public PendingQrConnect {
        Objects.requireNonNull(provider, "provider must not be null");
        Objects.requireNonNull(ownerId, "ownerId must not be null");
        Objects.requireNonNull(loginId, "loginId must not be null");
        Objects.requireNonNull(createdAt, "createdAt must not be null");
        if ((accountId == null) != (externalAccountId == null)) {
            throw new IllegalArgumentException("a reconnect needs both accountId and externalAccountId");
        }
    }

}
