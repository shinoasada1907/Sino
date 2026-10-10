package dev.sino.sync.application;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Automatic sync of imported accounts (F07, BE-49), under {@code sino.sync.live}: how old the last try of an account
 * may get before it is synced again. The schedule itself is {@code sino.sync.live.tick} (15 s) and runs unless
 * {@code sino.sync.live.scheduled} is false, as in the tests.
 */
@ConfigurationProperties("sino.sync.live")
public record LiveSyncProperties(Duration pollInterval) {

    public LiveSyncProperties {
        pollInterval = pollInterval == null ? Duration.ofSeconds(60) : pollInterval;
        if (!pollInterval.isPositive()) {
            throw new IllegalArgumentException("sino.sync.live.poll-interval must be positive");
        }
    }

}
