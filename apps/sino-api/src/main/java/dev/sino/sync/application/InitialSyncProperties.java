package dev.sino.sync.application;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How the first import waits and estimates ({@code sino.sync.*}, F05 design). Only tests change the waits. The speeds
 * bracket what BE-46 measured with real Gmail: about 100 messages a minute, one message read at a time.
 *
 * @param rateLimitWait the wait when the provider throttles without saying how long
 * @param rateLimitMaxWait the longest wait, whatever the provider asks
 * @param rateLimitAttempts how many throttled answers in a row the import accepts before it fails
 * @param unavailableWaits the waits before each new try when the provider cannot be reached; then it fails
 * @param slowMessagesPerMinute the speed of a slow import, for the most minutes of an estimate
 * @param fastMessagesPerMinute the speed of a fast import, for the fewest minutes of an estimate
 */
@ConfigurationProperties("sino.sync")
public record InitialSyncProperties(Duration rateLimitWait, Duration rateLimitMaxWait, Integer rateLimitAttempts,
        List<Duration> unavailableWaits, Integer slowMessagesPerMinute, Integer fastMessagesPerMinute) {

    public InitialSyncProperties {
        rateLimitWait = rateLimitWait == null ? Duration.ofSeconds(30) : rateLimitWait;
        rateLimitMaxWait = rateLimitMaxWait == null ? Duration.ofMinutes(5) : rateLimitMaxWait;
        rateLimitAttempts = rateLimitAttempts == null ? 5 : rateLimitAttempts;
        unavailableWaits = unavailableWaits == null
                ? List.of(Duration.ofSeconds(10), Duration.ofSeconds(30), Duration.ofSeconds(60))
                : List.copyOf(unavailableWaits);
        slowMessagesPerMinute = slowMessagesPerMinute == null ? 60 : slowMessagesPerMinute;
        fastMessagesPerMinute = fastMessagesPerMinute == null ? 120 : fastMessagesPerMinute;
    }

}
