package dev.sino.sync.application;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;

public enum SyncErrorCode implements ErrorCode {

    /** The same code and body as the account API: no such account of the caller, or it was removed. */
    ACCOUNT_NOT_FOUND(ErrorCategory.NOT_FOUND),

    /** The user turned the account off (D-12): it is not synced, so it is neither estimated nor imported. */
    ACCOUNT_DISABLED(ErrorCategory.CONFLICT);

    private final ErrorCategory category;

    SyncErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

    static SinoException accountDisabled() {
        return new SinoException(ACCOUNT_DISABLED, "The account is turned off. Turn it on to import its mail.");
    }

    static SinoException accountNotFound() {
        return new SinoException(ACCOUNT_NOT_FOUND, "Account not found.");
    }

}
