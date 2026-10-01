package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ProviderExceptionTests {

    @Test
    void carriesItsCodeAndMessage() {
        ProviderException exception = new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "token revoked");

        assertThat(exception.errorCode()).isEqualTo(ProviderErrorCode.AUTH_EXPIRED);
        assertThat(exception).hasMessage("token revoked");
    }

    @Test
    void needsACode() {
        assertThatThrownBy(() -> new ProviderException(null, "boom")).isInstanceOf(NullPointerException.class);
    }

    @Test
    void aRateLimitCanSayHowLongToWait() {
        ProviderException exception = ProviderException.rateLimited("quota exceeded", Duration.ofSeconds(30));

        assertThat(exception.errorCode()).isEqualTo(ProviderErrorCode.RATE_LIMITED);
        assertThat(exception.retryAfter()).contains(Duration.ofSeconds(30));
    }

    @Test
    void theWaitIsOptional() {
        assertThat(ProviderException.rateLimited("quota exceeded", null).retryAfter()).isEmpty();
    }

    @Test
    void otherCodesNeverHaveAWait() {
        assertThat(new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "timeout").retryAfter()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(longs = { 0, -5 })
    void theWaitMustBePositive(long seconds) {
        assertThatThrownBy(() -> ProviderException.rateLimited("quota exceeded", Duration.ofSeconds(seconds)))
                .isInstanceOf(IllegalArgumentException.class);
    }

}
