package dev.sino.provider.spi;

import java.util.Objects;

/**
 * A failure reported by a connector. The message can end up in logs and in skipped items, so it must not
 * contain secrets or raw provider payloads.
 */
public class ProviderException extends RuntimeException {

    private final ProviderErrorCode errorCode;

    public ProviderException(ProviderErrorCode errorCode, String message) {
        super(message);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode must not be null");
    }

    public ProviderErrorCode errorCode() {
        return errorCode;
    }

}
