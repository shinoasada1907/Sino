package dev.sino.realtime.application;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The event streams (F08), under {@code sino.realtime}: how long one lives before the browser connects again (and is
 * checked again), how often a quiet stream gets a comment line, the reconnect delay given to the browser, and how
 * many streams (tabs) one user may have open.
 */
@ConfigurationProperties("sino.realtime")
public record RealtimeProperties(Duration streamTimeout, Duration heartbeat, Duration reconnect,
        Integer maxStreamsPerUser) {

    public RealtimeProperties {
        streamTimeout = streamTimeout == null ? Duration.ofMinutes(20) : streamTimeout;
        heartbeat = heartbeat == null ? Duration.ofSeconds(25) : heartbeat;
        reconnect = reconnect == null ? Duration.ofSeconds(3) : reconnect;
        maxStreamsPerUser = maxStreamsPerUser == null ? 5 : maxStreamsPerUser;
        // A zero timeout would mean none: the sign-in would never be checked again.
        if (!streamTimeout.isPositive() || !heartbeat.isPositive() || !reconnect.isPositive()) {
            throw new IllegalArgumentException("sino.realtime durations must be positive");
        }
        if (maxStreamsPerUser < 1) {
            throw new IllegalArgumentException("sino.realtime.max-streams-per-user must be at least 1");
        }
    }

}
