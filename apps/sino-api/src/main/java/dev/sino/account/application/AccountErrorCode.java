package dev.sino.account.application;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;

/**
 * Errors of the account module that reach API clients (F02 error code catalog).
 */
public enum AccountErrorCode implements ErrorCode {

    /** No account with this ID belongs to the caller. An account of another user is reported the same way. */
    ACCOUNT_NOT_FOUND(ErrorCategory.NOT_FOUND),

    /** The provider exists but is not connected over OAuth2, so the connect flow cannot start (F04a). */
    CONNECT_NOT_SUPPORTED(ErrorCategory.INVALID),

    /** The provider exists but is not connected by QR code, so a QR connect cannot start (D-275). */
    CONNECT_METHOD_MISMATCH(ErrorCategory.INVALID),

    /** The provider's own switch is off (D-286): its accounts stay readable, none can be connected. */
    PROVIDER_DISABLED(ErrorCategory.CONFLICT),

    /** No QR connect with this login ID was started in this browser session, or it is over. */
    QR_LOGIN_NOT_FOUND(ErrorCategory.NOT_FOUND),

    /** The provider gave no QR code, or did not say where a login is; the login, if any, goes on. */
    QR_UNAVAILABLE(ErrorCategory.PROVIDER_FAILED),

    /** The user turned the account off (D-12): Sino does not talk to its provider until it is turned on again. */
    ACCOUNT_DISABLED(ErrorCategory.CONFLICT);

    private final ErrorCategory category;

    AccountErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

    static SinoException accountDisabled() {
        return new SinoException(ACCOUNT_DISABLED, "The account is turned off.");
    }

    /** The one way to report a missing account, so every endpoint answers the same body. */
    static SinoException accountNotFound() {
        return new SinoException(ACCOUNT_NOT_FOUND, "Account not found.");
    }

}
