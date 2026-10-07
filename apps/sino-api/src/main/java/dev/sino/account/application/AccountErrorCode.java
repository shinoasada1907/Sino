package dev.sino.account.application;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;

/**
 * Errors of the account module that reach API clients (F02 error code catalog).
 */
public enum AccountErrorCode implements ErrorCode {

    /** No account with this ID belongs to the caller. An account of another user is reported the same way. */
    ACCOUNT_NOT_FOUND(ErrorCategory.NOT_FOUND);

    private final ErrorCategory category;

    AccountErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

    /** The one way to report a missing account, so every endpoint answers the same body. */
    static SinoException accountNotFound() {
        return new SinoException(ACCOUNT_NOT_FOUND, "Account not found.");
    }

}
