package dev.sino.provider.spi;

/**
 * Why a provider operation failed. Each code has a fixed retry policy.
 */
public enum ProviderErrorCode {

    /** The token expired or was revoked and could not be refreshed. */
    AUTH_EXPIRED(false),

    /** The provider throttled us or the quota ran out. */
    RATE_LIMITED(true),

    /** A 5xx response, a timeout or a network failure. */
    PROVIDER_UNAVAILABLE(true),

    /** Any other 4xx response, such as not found or a bad request. */
    REQUEST_REJECTED(false),

    /** One item could not be normalized; it is skipped, the rest of the batch is kept. */
    PAYLOAD_NORMALIZATION_FAILED(false),

    /** The operation is not among the capabilities the connector declares. */
    CAPABILITY_NOT_SUPPORTED(false);

    private final boolean retryable;

    ProviderErrorCode(boolean retryable) {
        this.retryable = retryable;
    }

    public boolean retryable() {
        return retryable;
    }

}
