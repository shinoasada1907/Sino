package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

class ProviderErrorCodeTests {

    @Test
    void onlyRateLimitingAndUnavailabilityAreRetryable() {
        assertThat(Arrays.stream(ProviderErrorCode.values()).filter(ProviderErrorCode::retryable))
                .containsExactlyInAnyOrder(ProviderErrorCode.RATE_LIMITED, ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    // A write that may have taken effect must not be repeated blindly (D-132).
    @Test
    void anUnknownOutcomeIsNotRetryable() {
        assertThat(ProviderErrorCode.valueOf("OUTCOME_UNKNOWN").retryable()).isFalse();
    }

    @Test
    void anExpiredCursorIsNotRetryable() {
        assertThat(ProviderErrorCode.CURSOR_EXPIRED.retryable()).isFalse();
    }

}
