package dev.sino.sync.application;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountSummary;
import dev.sino.sync.infrastructure.SyncCheckpoints;

/**
 * Automatic sync (F07, BE-49): each imported account whose last sync was tried longer ago than
 * {@code sino.sync.live.poll-interval} (60 s) is synced again, unless the user paused automatic sync or turned the
 * account off, or it must be connected again. Timing from the last try, not the last success, keeps a failing account
 * from being asked at every tick of {@link LiveSyncSchedule}.
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
        return checkpoints.dueForSync(properties.pollInterval()).stream()
                .filter(accountId -> !runner.isReading(accountId))
                .filter(accountId -> directory.byId(accountId).filter(LiveSyncScheduler::syncsOnItsOwn).isPresent())
                .toList();
    }

    private static boolean syncsOnItsOwn(AccountSummary account) {
        return account.syncEnabled() && account.status() != AccountStatus.DISABLED
                && account.status() != AccountStatus.AUTH_EXPIRED;
    }

}
