package dev.sino.sync.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import dev.sino.conversation.NicknameSync;

/**
 * The clock of {@code conversation.nickname} sync (zalo-nicknames, D-418): every {@code sino.sync.nicknames.interval}
 * (5 min). The same switch as {@link LiveSyncSchedule}, {@code sino.sync.live.scheduled}, leaves it out of the
 * application in tests, which call {@link NicknameSync} themselves.
 */
@Component
@ConditionalOnProperty(name = "sino.sync.live.scheduled", havingValue = "true", matchIfMissing = true)
class NicknameSyncSchedule {

    private static final Logger log = LoggerFactory.getLogger(NicknameSyncSchedule.class);

    private final NicknameSync nicknames;
    // Only the scheduling thread runs tick().
    private boolean failing;

    NicknameSyncSchedule(NicknameSync nicknames) {
        this.nicknames = nicknames;
    }

    @Scheduled(fixedDelayString = "${sino.sync.nicknames.interval:PT5M}",
            initialDelayString = "${sino.sync.nicknames.interval:PT5M}")
    void tick() {
        try {
            nicknames.syncAll();
            if (failing) {
                failing = false;
                log.info("Nicknames are synced again");
            }
        } catch (RuntimeException failure) {
            if (!failing) {
                failing = true;
                log.warn("Nicknames could not be synced: {}", failure.toString());
            }
        }
    }

}
