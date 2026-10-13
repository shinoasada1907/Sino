package dev.sino.sync.application;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import dev.sino.account.AccountDirectory;
import dev.sino.sync.infrastructure.SyncCheckpoints;

/**
 * Automatic sync (F07, BE-49): each imported account whose last sync was tried longer ago than
 * {@code sino.sync.live.poll-interval} (60 s) is synced again, unless the user paused automatic sync or turned the
 * account off, or it must be connected again. While the provider tells Sino of the account's changes (an active
 * watch, BE-51), the interval is {@code fallback-interval} (5 min), in case a notice is lost. Timing from the last
 * try, not the last success, keeps a failing account from being asked at every tick of {@link LiveSyncSchedule}.
 */
@Component
public class LiveSyncScheduler {

    private final SyncCheckpoints checkpoints;
    private final AccountDirectory directory;
    private final ImportRunner runner;
    private final LiveSyncProperties properties;

    LiveSyncScheduler(SyncCheckpoints checkpoints, AccountDirectory directory, ImportRunner runner,
            LiveSyncProperties properties) {
        this.checkpoints = checkpoints;
        this.directory = directory;
        this.runner = runner;
        this.properties = properties;
    }

    public void syncDueAccounts() {
        dueAccounts().forEach(runner::submit);
    }

    /**
     * The accounts automatic sync asks for now, the longest waiting first. An account being read is left out: the
     * pass under way is timed again when it ends.
     */
    public List<UUID> dueAccounts() {
        return checkpoints.dueForSync(properties.pollInterval(), properties.fallbackInterval()).stream()
                .filter(accountId -> !runner.isReading(accountId))
                .filter(accountId -> directory.byId(accountId).filter(AccountChecks::syncsOnItsOwn).isPresent())
                .toList();
    }

}
