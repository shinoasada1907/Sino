package dev.sino.sync.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The clock of automatic sync (BE-49): every {@code sino.sync.live.tick} (15 s) after the last run ended. Left out of
 * the application when {@code sino.sync.live.scheduled} is false, as in the tests, which call
 * {@link LiveSyncScheduler} themselves.
 */
@Component
@ConditionalOnProperty(name = "sino.sync.live.scheduled", havingValue = "true", matchIfMissing = true)
class LiveSyncSchedule {

    private static final Logger log = LoggerFactory.getLogger(LiveSyncSchedule.class);

    private final LiveSyncScheduler scheduler;
    // Only the scheduling thread runs tick(), one run after the other.
    private boolean failing;

    LiveSyncSchedule(LiveSyncScheduler scheduler) {
        this.scheduler = scheduler;
    }

    @Scheduled(fixedDelayString = "${sino.sync.live.tick:PT15S}", initialDelayString = "${sino.sync.live.tick:PT15S}")
    void tick() {
        try {
            scheduler.syncDueAccounts();
            if (failing) {
                failing = false;
                log.info("Automatic sync looks for due accounts again");
            }
        } catch (RuntimeException failure) {
            // The database is down, most likely: said once, not at every tick, and the schedule goes on.
            if (!failing) {
                failing = true;
                log.warn("Automatic sync cannot look for due accounts: {}", failure.toString());
            }
        }
    }

}
