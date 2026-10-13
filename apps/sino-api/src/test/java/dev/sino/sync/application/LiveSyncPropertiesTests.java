package dev.sino.sync.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Duration;

import org.junit.jupiter.api.Test;

class LiveSyncPropertiesTests {

    @Test
    void anAccountIsAskedEveryMinuteByDefault() {
        assertThat(new LiveSyncProperties(null, null, null).pollInterval()).isEqualTo(Duration.ofSeconds(60));
    }

    @Test
    void anAccountWithAWatchIsAskedEveryFiveMinutesByDefault() {
        assertThat(new LiveSyncProperties(null, null, null).fallbackInterval()).isEqualTo(Duration.ofMinutes(5));
    }

    @Test
    void aWatchIsRenewedTwoDaysBeforeItEndsByDefault() {
        assertThat(new LiveSyncProperties(null, null, null).pushRenewBefore()).isEqualTo(Duration.ofDays(2));
    }

    @Test
    void keepsWhatItIsGiven() {
        LiveSyncProperties properties = new LiveSyncProperties(Duration.ofSeconds(30), Duration.ofMinutes(10),
                Duration.ofHours(12));

        assertThat(properties.pollInterval()).isEqualTo(Duration.ofSeconds(30));
        assertThat(properties.fallbackInterval()).isEqualTo(Duration.ofMinutes(10));
        assertThat(properties.pushRenewBefore()).isEqualTo(Duration.ofHours(12));
    }

    @Test
    void theDurationsMustBePositive() {
        assertThatIllegalArgumentException().isThrownBy(() -> new LiveSyncProperties(Duration.ZERO, null, null))
                .withMessageContaining("poll-interval");
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new LiveSyncProperties(Duration.ofSeconds(-1), null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> new LiveSyncProperties(null, Duration.ZERO, null))
                .withMessageContaining("fallback-interval");
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new LiveSyncProperties(null, null, Duration.ofDays(-1)))
                .withMessageContaining("push-renew-before");
    }

}
