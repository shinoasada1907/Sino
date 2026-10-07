package dev.sino.common.error;

import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * A failure that the API reports to the client with its {@link ErrorCode}.
 * The message becomes the {@code detail} of the response, so it must be safe to show: no secrets, no SQL,
 * no internal identifiers beyond what the client already sent. The same holds for {@link #properties()}.
 */
public class SinoException extends RuntimeException {

    private static final Set<String> STANDARD_MEMBERS = Set.of("type", "title", "status", "detail", "instance", "code");

    private final ErrorCode errorCode;
    private final Map<String, Object> properties;

    public SinoException(ErrorCode errorCode, String message) {
        this(errorCode, message, Map.of());
    }

    public SinoException(ErrorCode errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
        this.properties = Map.of();
    }

    /**
     * @param properties extra members of the problem response, for example {@code remainingAttempts}; they cannot
     *        replace a standard member. A {@link ErrorCategory#RATE_LIMITED} error with {@code retryAfterSeconds}
     *        also sends the {@code Retry-After} header.
     */
    public SinoException(ErrorCode errorCode, String message, Map<String, Object> properties) {
        super(message);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
        for (String name : properties.keySet()) {
            if (STANDARD_MEMBERS.contains(name)) {
                throw new IllegalArgumentException("'" + name + "' is a standard member of the problem response");
            }
        }
        this.properties = Map.copyOf(properties);
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

    public Map<String, Object> properties() {
        return properties;
    }

}
