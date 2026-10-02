package dev.sino.provider;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;

/**
 * Errors of the provider module that reach API clients (F03 error code catalog). Failures of a provider
 * itself use {@link dev.sino.provider.spi.ProviderErrorCode} instead (D-24).
 */
public enum ProviderRegistryErrorCode implements ErrorCode {

    /** No connector is registered for the requested provider type. */
    UNKNOWN_PROVIDER(ErrorCategory.NOT_FOUND);

    private final ErrorCategory category;

    ProviderRegistryErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

}
