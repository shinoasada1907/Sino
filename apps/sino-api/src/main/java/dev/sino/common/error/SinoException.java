package dev.sino.common.error;

import java.util.Objects;

/**
 * A failure that the API reports to the client with its {@link ErrorCode}.
 * The message becomes the {@code detail} of the response, so it must be safe to show: no secrets, no SQL,
 * no internal identifiers beyond what the client already sent.
 */
public class SinoException extends RuntimeException {

    private final ErrorCode errorCode;

    public SinoException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
    }

    public SinoException(ErrorCode errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

}
