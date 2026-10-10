package dev.sino.sync.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Duration;

import org.junit.jupiter.api.Test;

class LiveSyncPropertiesTests {

    @Test
    void anAccountIsAskedEveryMinuteByDefault() {
        assertThat(new LiveSyncProperties(null).pollInterval()).isEqualTo(Duration.ofSeconds(60));
    }

    @Test
    void theIntervalMustBePositive() {
        assertThatIllegalArgumentException().isThrownBy(() -> new LiveSyncProperties(Duration.ZERO));
        assertThatIllegalArgumentException().isThrownBy(() -> new LiveSyncProperties(Duration.ofSeconds(-1)));
    }

}
