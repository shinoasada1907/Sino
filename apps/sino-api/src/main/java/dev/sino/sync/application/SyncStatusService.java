package dev.sino.sync.application;

import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.sino.sync.AccountSyncStatus;
import dev.sino.sync.SyncStatuses;
import dev.sino.sync.infrastructure.SyncCheckpoints;

/** {@link SyncStatuses} over the checkpoint of each account; {@code push} is worked out as for the owner. */
@Service
public class SyncStatusService implements SyncStatuses {

    private final SyncCheckpoints checkpoints;

    SyncStatusService(SyncCheckpoints checkpoints) {
        this.checkpoints = checkpoints;
    }

    @Override
    public AccountSyncStatus statusOf(UUID accountId) {
        return checkpoints.find(accountId)
                .map(checkpoint -> new AccountSyncStatus(checkpoint.status(), checkpoint.lastErrorCode(),
                        checkpoint.lastSyncAt(), checkpoint.lastSyncError(), LiveSyncService.pushOf(checkpoint)))
                .orElse(AccountSyncStatus.NEVER_IMPORTED);
    }

}
