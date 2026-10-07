package dev.sino.common.error;

/**
 * A stable error code that clients can rely on. Modules implement it with an enum, for example
 * {@code enum AccountErrorCode implements ErrorCode { ACCOUNT_NOT_FOUND(ErrorCategory.NOT_FOUND) }}.
 * Every code is listed in the error code catalog of the design documents.
 */
public interface ErrorCode {

    /** Implemented by enums; the constant name is the code. */
    String name();

    /** UPPER_SNAKE_CASE code sent to clients as the {@code code} property of the problem response. */
    default String code() {
        return name();
    }

    ErrorCategory category();

}
