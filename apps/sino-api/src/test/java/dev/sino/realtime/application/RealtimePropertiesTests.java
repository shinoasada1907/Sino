package dev.sino.realtime.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Duration;

import org.junit.jupiter.api.Test;

class RealtimePropertiesTests {

    @Test
    void defaults() {
        RealtimeProperties properties = new RealtimeProperties(null, null, null, null);

        assertThat(properties.streamTimeout()).isEqualTo(Duration.ofMinutes(20));
        assertThat(properties.heartbeat()).isEqualTo(Duration.ofSeconds(25));
        assertThat(properties.reconnect()).isEqualTo(Duration.ofSeconds(3));
        assertThat(properties.maxStreamsPerUser()).isEqualTo(5);
    }

    @Test
    void aZeroTimeoutWouldMeanNoneAndIsRefused() {
        assertThatIllegalArgumentException().isThrownBy(() -> new RealtimeProperties(Duration.ZERO, null, null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> new RealtimeProperties(null, Duration.ZERO, null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> new RealtimeProperties(null, null, Duration.ZERO, null));
    }

    @Test
    void aUserMayHaveAtLeastOneStream() {
        assertThatIllegalArgumentException().isThrownBy(() -> new RealtimeProperties(null, null, null, 0));
        assertThat(new RealtimeProperties(null, null, null, 1).maxStreamsPerUser()).isEqualTo(1);
    }

}
