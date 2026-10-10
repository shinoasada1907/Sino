package dev.sino.sync.application;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.StoreResult;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.sync.infrastructure.SyncCheckpoints;
import dev.sino.sync.infrastructure.SyncCheckpoints.Checkpoint;

/**
 * Reads the mail of one account in the background, page after page: its first import (F05 design, section 3), then
 * the syncs that keep it up to date from the saved cursor (F07, D-79). The connector is called outside any
 * transaction; storing a page and moving the cursor on are one transaction, so a failure never moves the cursor past
 * mail that was not stored. Logs name the account, item IDs and error codes, never mail or tokens.
 */
@Component
class ImportRunner implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(ImportRunner.class);
    // When a sync's cursor expired, mail is listed again from this long before the last successful read.
    private static final Duration RECOVERY_OVERLAP = Duration.ofDays(1);

    private final ProviderAccess access;
    private final ConversationStore store;
    private final SyncCheckpoints checkpoints;
    private final TransactionTemplate transactions;
    private final InitialSyncProperties properties;
    // One virtual thread per account being read (D-69): reading mostly waits for the provider. Kept here rather than
    // as a bean, so Spring Boot keeps its own task executor.
    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("mail-sync-", 0).factory());
    // Per account: 1 while a worker reads it, more when requests came meanwhile. Those ask for one more look at the
    // row, however many they are, and two workers never read one account.
    private final Map<UUID, AtomicInteger> requests = new ConcurrentHashMap<>();

    ImportRunner(ProviderAccess access, ConversationStore store, SyncCheckpoints checkpoints,
            TransactionTemplate transactions, InitialSyncProperties properties) {
        this.access = access;
        this.store = store;
        this.checkpoints = checkpoints;
        this.transactions = transactions;
        this.properties = properties;
    }

    /**
     * Reads the account in the background: goes on with its import if the row is RUNNING, syncs it if the import is
     * DONE, does nothing otherwise. Harmless while a worker already reads it: that one looks at the row once more.
     */
    void submit(UUID accountId) {
        AtomicInteger pending = requests.computeIfAbsent(accountId, id -> new AtomicInteger());
        if (pending.getAndIncrement() == 0) {
            try {
                executor.execute(() -> work(accountId, pending));
            } catch (RejectedExecutionException closing) {
                pending.set(0);
            }
        }
    }

    /**
     * Interrupts the running reads when the application closes. An import keeps its row RUNNING, and
     * {@link ImportResumer} goes on with it at the next start; a sync records nothing and runs at the next request.
     */
    @Override
    public void destroy() {
        executor.shutdownNow();
    }

    private void work(UUID accountId, AtomicInteger pending) {
        try {
            while (true) {
                run(accountId);
                if (Thread.currentThread().isInterrupted()) {
                    // This thread is being stopped; what was asked meanwhile goes to a fresh one, unless closing.
                    if (pending.getAndSet(0) > 1) {
                        submit(accountId);
                    }
                    return;
                }
                if (pending.updateAndGet(count -> count > 1 ? 1 : 0) == 0) {
                    return;
                }
            }
        } catch (Error fatal) {
            // Left at 1 or more, the count would keep every later request from starting a worker.
            pending.set(0);
            log.error("Reading account {} stopped on an error", accountId, fatal);
            throw fatal;
        }
    }

    private void run(UUID accountId) {
        Pass pass = Pass.IMPORT;
        try {
            Checkpoint checkpoint = checkpoints.find(accountId).orElse(null);
            if (checkpoint == null) {
                return;
            }
            if ("RUNNING".equals(checkpoint.status())) {
                checkpoints.beginRun(accountId);
                log.info("Initial sync of account {} runs ({}, {} messages imported so far)", accountId,
                        checkpoint.range(), checkpoint.imported());
                if (checkpoint.estimated() == null) {
                    estimate(checkpoint);
                }
            } else if ("DONE".equals(checkpoint.status())) {
                pass = Pass.SYNC;
                if (!checkpoints.beginSync(accountId)) {
                    return;
                }
            } else {
                return;
            }
            readPages(accountId, pass);
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
            log.info("{} of account {} stopped", pass.label, accountId);
        } catch (ImportStartedAgain again) {
            log.info("Sync of account {} stopped: its import started again", accountId);
        } catch (SinoException failure) {
            // ProviderAccess: the account was removed or turned off, or its connector is gone.
            fail(accountId, pass, failure.errorCode().code());
        } catch (RuntimeException failure) {
            if (Thread.currentThread().isInterrupted()) {
                log.info("{} of account {} stopped", pass.label, accountId);
                return;
            }
            log.error("{} of account {} failed", pass.label, accountId, failure);
            fail(accountId, pass, "INTERNAL");
        }
    }

    // The estimate is only shown; when the connector cannot tell or fails, the import goes on without it.
    private void estimate(Checkpoint checkpoint) {
        try {
            access.call(checkpoint.accountId(), (connector, context) -> connector.estimateMessages(context,
                    checkpoint.since())).ifPresent(messages -> checkpoints.estimated(checkpoint.accountId(), messages));
        } catch (ProviderException failure) {
            log.warn("Initial sync of account {}: no estimate ({})", checkpoint.accountId(), failure.errorCode());
        }
    }

    private void readPages(UUID accountId, Pass pass) throws InterruptedException {
        int throttled = 0;
        int unreachable = 0;
        boolean startedOver = false;
        SyncCursor recovery = null;
        while (!Thread.currentThread().isInterrupted()) {
            Checkpoint checkpoint = checkpoints.find(accountId).orElseThrow();
            if (pass == Pass.SYNC && !"DONE".equals(checkpoint.status())) {
                throw new ImportStartedAgain();
            }
            SyncCursor cursor = recovery != null ? recovery
                    : checkpoint.cursor() == null ? SyncCursor.initial(checkpoint.since())
                            : new SyncCursor(checkpoint.cursor());
            recovery = null;
            SyncBatch batch;
            try {
                batch = access.call(accountId, (connector, context) -> connector.fetchUpdates(context, cursor));
            } catch (ProviderException failure) {
                switch (failure.errorCode()) {
                    case RATE_LIMITED -> {
                        if (++throttled > properties.rateLimitAttempts()) {
                            fail(accountId, pass, failure.errorCode().name());
                            return;
                        }
                        Duration wait = failure.retryAfter().orElse(properties.rateLimitWait());
                        pause(accountId, pass, failure, wait.compareTo(properties.rateLimitMaxWait()) > 0
                                ? properties.rateLimitMaxWait() : wait);
                    }
                    case PROVIDER_UNAVAILABLE -> {
                        if (unreachable >= properties.unavailableWaits().size()) {
                            fail(accountId, pass, failure.errorCode().name());
                            return;
                        }
                        pause(accountId, pass, failure, properties.unavailableWaits().get(unreachable++));
                    }
                    // D-60: the provider no longer knows the cursor. Listing again is safe once, since storing is
                    // idempotent: an import from its start, a sync from a day before what it last read in full.
                    case CURSOR_EXPIRED -> {
                        if (startedOver) {
                            fail(accountId, pass, failure.errorCode().name());
                            return;
                        }
                        startedOver = true;
                        log.warn("{} of account {} starts over: {}", pass.label, accountId, failure.errorCode());
                        if (pass == Pass.IMPORT) {
                            checkpoints.startOver(accountId);
                        } else {
                            recovery = SyncCursor.initial(recoverySince(checkpoint));
                        }
                    }
                    default -> {
                        fail(accountId, pass, failure.errorCode().name());
                        return;
                    }
                }
                continue;
            }
            boolean done = !batch.hasMore();
            // A connector that says there is more but gives back the same cursor would be asked forever.
            if (!done && batch.nextCursor().value().equals(cursor.value())) {
                fail(accountId, pass, "CURSOR_STUCK");
                return;
            }
            transactions.executeWithoutResult(status -> {
                StoreResult stored = store.store(accountId, batch);
                if (pass == Pass.IMPORT) {
                    checkpoints.advance(accountId, batch.nextCursor().value(), stored.newMessages()
                            + stored.updatedMessages(), batch.skipped().size(), done);
                } else if (!checkpoints.advanceSync(accountId, batch.nextCursor().value(), done)) {
                    throw new ImportStartedAgain();
                }
            });
            if (!batch.skipped().isEmpty()) {
                log.warn("{} of account {} skipped {}", pass.label, accountId, batch.skipped().stream()
                        .map(item -> item.externalId() + " (" + item.reason() + ")").collect(Collectors.joining(", ")));
            }
            throttled = 0;
            unreachable = 0;
            if (done) {
                if (pass == Pass.IMPORT) {
                    log.info("Initial sync of account {} is done", accountId);
                } else {
                    log.debug("Sync of account {} is done", accountId);
                }
                return;
            }
        }
        throw new InterruptedException();
    }

    // From the last moment everything was read: the end of the last successful sync, or else of the import.
    private static Instant recoverySince(Checkpoint checkpoint) {
        Instant lastRead = checkpoint.lastSyncAt() != null ? checkpoint.lastSyncAt() : checkpoint.lastSuccessAt();
        return lastRead == null ? checkpoint.since() : lastRead.minus(RECOVERY_OVERLAP);
    }

    private static void pause(UUID accountId, Pass pass, ProviderException failure, Duration wait)
            throws InterruptedException {
        log.warn("{} of account {} waits {} ms: {}", pass.label, accountId, wait.toMillis(), failure.errorCode());
        Thread.sleep(wait);
    }

    // A stopping thread records nothing: an import stays RUNNING (design, section 3) and a sync runs again later. A
    // failure to record the failure is only logged; the next start or sync takes the row up again.
    private void fail(UUID accountId, Pass pass, String errorCode) {
        if (Thread.currentThread().isInterrupted()) {
            log.info("{} of account {} stopped", pass.label, accountId);
            return;
        }
        log.warn("{} of account {} failed: {}", pass.label, accountId, errorCode);
        try {
            if (pass == Pass.IMPORT) {
                checkpoints.fail(accountId, errorCode);
            } else {
                checkpoints.syncFailed(accountId, errorCode);
            }
        } catch (RuntimeException failure) {
            log.error("{} of account {}: the failure could not be recorded", pass.label, accountId, failure);
        }
    }

    /** The first import of an account, or a sync after it is DONE. */
    private enum Pass {

        IMPORT("Initial sync"), SYNC("Sync");

        private final String label;

        Pass(String label) {
            this.label = label;
        }

    }

    /** The user started the import again while a sync was reading: the sync stops, its page rolled back. */
    private static final class ImportStartedAgain extends RuntimeException {

        ImportStartedAgain() {
            super(null, null, false, false);
        }

    }

}
