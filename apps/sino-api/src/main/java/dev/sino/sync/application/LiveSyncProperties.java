package dev.sino.sync.application;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Automatic sync of imported accounts (F07, BE-49, BE-51), under {@code sino.sync.live}: how old the last try of an
 * account may get before it is synced again, {@code poll-interval} (60 s), or {@code fallback-interval} (5 min) while
 * the provider tells Sino of its changes; and how long before its end a watch is renewed, {@code push-renew-before}
 * (2 days). The schedules themselves are {@code sino.sync.live.tick} (15 s) and {@code push-check} (1 hour, the first
 * after {@code push-check-delay}, 1 min), and run unless {@code sino.sync.live.scheduled} is false, as in the tests.
 */
@ConfigurationProperties("sino.sync.live")
public record LiveSyncProperties(Duration pollInterval, Duration fallbackInterval, Duration pushRenewBefore) {

    public LiveSyncProperties {
        pollInterval = positive(pollInterval, Duration.ofSeconds(60), "poll-interval");
        fallbackInterval = positive(fallbackInterval, Duration.ofMinutes(5), "fallback-interval");
        pushRenewBefore = positive(pushRenewBefore, Duration.ofDays(2), "push-renew-before");
    }

    private static Duration positive(Duration value, Duration byDefault, String name) {
        Duration duration = value == null ? byDefault : value;
        if (!duration.isPositive()) {
            throw new IllegalArgumentException("sino.sync.live." + name + " must be positive");
        }
        return duration;
    }

}
