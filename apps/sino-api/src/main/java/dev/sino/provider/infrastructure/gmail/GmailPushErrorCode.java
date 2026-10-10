package dev.sino.provider.infrastructure.gmail;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;

/** Answers of the webhook of Gmail's notices (D-76) to a push it does not take. */
enum GmailPushErrorCode implements ErrorCode {

    /** No token, or not one Google gave the push subscription: nothing happens, and Pub/Sub may send it again. */
    PUSH_TOKEN_INVALID(ErrorCategory.UNAUTHENTICATED),

    /** Google's keys cannot be fetched, so no token can be checked now: Pub/Sub sends the notice again later. */
    PUSH_KEYS_UNAVAILABLE(ErrorCategory.DEPENDENCY_UNAVAILABLE);

    private final ErrorCategory category;

    GmailPushErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

    static SinoException tokenInvalid() {
        return new SinoException(PUSH_TOKEN_INVALID, "The request carries no valid token of Google.");
    }

    static SinoException keysUnavailable() {
        return new SinoException(PUSH_KEYS_UNAVAILABLE, "Google's signing keys cannot be fetched now.");
    }

}
