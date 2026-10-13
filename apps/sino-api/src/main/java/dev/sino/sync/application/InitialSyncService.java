package dev.sino.sync.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.OptionalLong;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.AccountDirectory;
import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.conversation.ConversationStats;
import dev.sino.provider.spi.ProviderException;
import dev.sino.sync.infrastructure.SyncCheckpoints;
import dev.sino.sync.infrastructure.SyncCheckpoints.Checkpoint;

/**
 * The first import of an account (D-64): how much there is, starting it, and how far it is. Always for an account of
 * the owner that is not removed; any other is not found, exactly like in the account API.
 */
@Service
public class InitialSyncService {

    private final AccountDirectory directory;
    private final ProviderAccess access;
    private final SyncCheckpoints checkpoints;
    private final ConversationStats stats;
    private final ImportRunner runner;
    private final TransactionTemplate transactions;
    private final InitialSyncProperties properties;
    private final Clock clock;

    InitialSyncService(AccountDirectory directory, ProviderAccess access, SyncCheckpoints checkpoints,
            ConversationStats stats, ImportRunner runner, TransactionTemplate transactions,
            InitialSyncProperties properties, Clock clock) {
        this.directory = directory;
        this.access = access;
        this.checkpoints = checkpoints;
        this.stats = stats;
        this.runner = runner;
        this.transactions = transactions;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * The connector's estimate for the range and the minutes it may take (D-65); empty when the connector cannot
     * tell or fails. Calls the provider, so never inside a transaction.
     */
    public SyncEstimate estimate(UUID ownerId, UUID accountId, SyncRange range) {
        AccountChecks.requireEnabled(AccountChecks.requireAccount(directory, ownerId, accountId));
        OptionalLong messages;
        try {
            messages = access.call(accountId,
                    (connector, context) -> connector.estimateMessages(context, range.since(clock.instant())));
        } catch (ProviderException failure) {
            messages = OptionalLong.empty();
        }
        if (messages.isEmpty()) {
            return new SyncEstimate(null, null, null);
        }
        long count = messages.getAsLong();
        return new SyncEstimate(count, minutes(count, properties.fastMessagesPerMinute()),
                minutes(count, properties.slowMessagesPerMinute()));
    }

    /**
     * Starts the import in the background, or leaves the one already running (spec "Bắt đầu lần nhập đầu"), and
     * returns its status. The work is handed over only once the RUNNING row is committed. A running import is
     * handed over again too: harmless while it runs, and it takes up a row that lost its worker.
     *
     * @throws SinoException with {@code ACCOUNT_DISABLED} when the user turned the account off (D-12: not synced)
     */
    public InitialSyncStatus start(UUID ownerId, UUID accountId, SyncRange range) {
        AccountChecks.requireEnabled(AccountChecks.requireAccount(directory, ownerId, accountId));
        transactions.executeWithoutResult(
                status -> checkpoints.start(accountId, range.name(), range.since(clock.instant())));
        InitialSyncStatus status = statusOf(accountId);
        if ("RUNNING".equals(status.status())) {
            runner.submit(accountId);
        }
        return status;
    }

    public InitialSyncStatus status(UUID ownerId, UUID accountId) {
        AccountChecks.requireAccount(directory, ownerId, accountId);
        return statusOf(accountId);
    }

    /**
     * Minutes left at the speed of the running import so far: the estimate minus what is imported, at least 0. Empty
     * without an estimate, when not running, or before the import has run long enough to know its speed.
     */
    static Integer remainingMinutes(String status, Long estimated, long imported, long importedThisRun,
            Duration running) {
        if (!"RUNNING".equals(status) || estimated == null || importedThisRun <= 0 || running.toSeconds() < 5) {
            return null;
        }
        double perMinute = importedThisRun * 60.0 / running.toSeconds();
        return (int) Math.ceil(Math.max(0, estimated - imported) / perMinute);
    }

    private InitialSyncStatus statusOf(UUID accountId) {
        long stored = stats.storedMessages(accountId);
        Checkpoint checkpoint = checkpoints.find(accountId).orElse(null);
        if (checkpoint == null) {
            return new InitialSyncStatus("NOT_STARTED", null, 0, 0, null, null, stored, null, null, null);
        }
        Instant now = clock.instant();
        Integer remaining = remainingMinutes(checkpoint.status(), checkpoint.estimated(), checkpoint.imported(),
                checkpoint.runImported(), checkpoint.runStartedAt() == null ? Duration.ZERO
                        : Duration.between(checkpoint.runStartedAt(), now));
        Instant finishedAt = switch (checkpoint.status()) {
            case "DONE" -> checkpoint.lastSuccessAt();
            case "FAILED" -> checkpoint.updatedAt();
            default -> null;
        };
        return new InitialSyncStatus(checkpoint.status(), SyncRange.valueOf(checkpoint.range()), checkpoint.imported(),
                checkpoint.skipped(), checkpoint.estimated(), remaining, stored, checkpoint.lastStartedAt(),
                finishedAt, checkpoint.lastErrorCode());
    }

    private static int minutes(long messages, int perMinute) {
        return (int) Math.ceil((double) messages / perMinute);
    }

    /** {@code messages} and the minutes are null together, when the connector cannot estimate. */
    public record SyncEstimate(Long messages, Integer minMinutes, Integer maxMinutes) {
    }

    /** Where the first import of an account stands (design, section 3). */
    public record InitialSyncStatus(String status, SyncRange range, int imported, int skipped, Long estimated,
            Integer remainingMinutes, long storedMessages, Instant startedAt, Instant finishedAt, String errorCode) {
    }

}
