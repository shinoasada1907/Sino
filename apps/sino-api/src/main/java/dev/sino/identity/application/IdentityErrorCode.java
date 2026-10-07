package dev.sino.identity.application;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;

/**
 * Errors of the identity module that reach API clients (change fe-f01-web-foundation, error code catalog).
 */
public enum IdentityErrorCode implements ErrorCode {

    /** Wrong email or wrong password: one answer for both, so nobody learns which emails exist. */
    INVALID_CREDENTIALS(ErrorCategory.UNAUTHENTICATED),

    /** Five wrong sign-ins in a row for one email: it is locked for fifteen minutes (D-35). */
    LOGIN_LOCKED(ErrorCategory.RATE_LIMITED);

    private final ErrorCategory category;

    IdentityErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

}
