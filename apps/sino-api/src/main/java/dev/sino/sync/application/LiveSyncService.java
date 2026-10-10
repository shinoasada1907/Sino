package dev.sino.sync.application;

import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.sino.account.AccountDirectory;
import dev.sino.sync.infrastructure.SyncCheckpoints;
import dev.sino.sync.infrastructure.SyncCheckpoints.Checkpoint;

/**
 * Keeping an imported account up to date (F07, D-79): "Đồng bộ ngay" and where the syncs stand. Always for an account
 * of the owner that is not removed; any other is not found, exactly like in the account API.
 */
@Service
public class LiveSyncService {

    private final AccountDirectory directory;
    private final SyncCheckpoints checkpoints;
    private final ImportRunner runner;

    LiveSyncService(AccountDirectory directory, SyncCheckpoints checkpoints, ImportRunner runner) {
        this.directory = directory;
        this.checkpoints = checkpoints;
        this.runner = runner;
    }

    /**
     * Syncs the account in the background now, also when the user paused automatic sync: they asked for it.
     *
     * @throws dev.sino.common.error.SinoException with {@code ACCOUNT_DISABLED} when the user turned the account off,
     *         {@code IMPORT_NOT_DONE} while its first import is not DONE
     */
    public LiveSyncStatus syncNow(UUID ownerId, UUID accountId) {
        AccountChecks.requireEnabled(AccountChecks.requireAccount(directory, ownerId, accountId));
        LiveSyncStatus status = statusOf(accountId);
        if (!status.importDone()) {
            throw SyncErrorCode.importNotDone();
        }
        runner.submit(accountId);
        return status;
    }

    public LiveSyncStatus status(UUID ownerId, UUID accountId) {
        AccountChecks.requireAccount(directory, ownerId, accountId);
        return statusOf(accountId);
    }

    private LiveSyncStatus statusOf(UUID accountId) {
        Checkpoint checkpoint = checkpoints.find(accountId).orElse(null);
        if (checkpoint == null) {
            return new LiveSyncStatus(false, null, null, "OFF", null);
        }
        return new LiveSyncStatus("DONE".equals(checkpoint.status()), checkpoint.lastSyncAt(),
                checkpoint.lastSyncError(), "OFF", null);
    }

    /**
     * Where the syncs of an account stand: {@code lastSyncAt} of the last successful one, {@code lastError} of the
     * last one when it failed. {@code push} tells whether the provider notifies Sino of changes: {@code ACTIVE},
     * {@code FAILED} or {@code OFF} (always {@code OFF} until Gmail watch, BE-51).
     */
    public record LiveSyncStatus(boolean importDone, Instant lastSyncAt, String lastError, String push,
            Instant pushExpiresAt) {
    }

}
