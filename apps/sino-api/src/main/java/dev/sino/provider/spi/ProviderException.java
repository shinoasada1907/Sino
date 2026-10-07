package dev.sino.provider.spi;

import java.time.Duration;
import java.util.Objects;
import java.util.Optional;

/**
 * A failure reported by a connector. Deliberately not a {@code SinoException}: sync and messaging catch it
 * and report their own operation-level error (FR-08), so a provider message never reaches a client by
 * accident. The message can end up in logs and in skipped items, so it must not contain secrets or raw
 * provider payloads.
 */
public class ProviderException extends RuntimeException {

    private final ProviderErrorCode errorCode;
    private final Duration retryAfter;

    public ProviderException(ProviderErrorCode errorCode, String message) {
        this(errorCode, message, null);
    }

    private ProviderException(ProviderErrorCode errorCode, String message, Duration retryAfter) {
        super(message);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode must not be null");
        this.retryAfter = retryAfter;
    }

    /** The provider throttled us; {@code retryAfter} is how long it asked us to wait, if it said. */
    public static ProviderException rateLimited(String message, Duration retryAfter) {
        if (retryAfter != null && (retryAfter.isNegative() || retryAfter.isZero())) {
            throw new IllegalArgumentException("retryAfter must be positive");
        }
        return new ProviderException(ProviderErrorCode.RATE_LIMITED, message, retryAfter);
    }

    public ProviderErrorCode errorCode() {
        return errorCode;
    }

    /** Only a {@link #rateLimited} failure can have one. */
    public Optional<Duration> retryAfter() {
        return Optional.ofNullable(retryAfter);
    }

}
