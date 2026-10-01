package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

class ProviderErrorCodeTests {

    @Test
    void onlyRateLimitingAndUnavailabilityAreRetryable() {
        assertThat(Arrays.stream(ProviderErrorCode.values()).filter(ProviderErrorCode::retryable))
                .containsExactlyInAnyOrder(ProviderErrorCode.RATE_LIMITED, ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void anExceptionCarriesItsCodeAndMessage() {
        ProviderException exception = new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "token revoked");

        assertThat(exception.errorCode()).isEqualTo(ProviderErrorCode.AUTH_EXPIRED);
        assertThat(exception).hasMessage("token revoked");
    }

    @Test
    void anExceptionNeedsACode() {
        assertThatThrownBy(() -> new ProviderException(null, "boom")).isInstanceOf(NullPointerException.class);
    }

}
