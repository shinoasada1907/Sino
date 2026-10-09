package dev.sino.sync.application;

import java.time.Duration;
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
 * The first import of one account, page after page, in the background (F05 design, section 3). The connector is
 * called outside any transaction; storing a page and moving the cursor on are one transaction, so a failure never
 * moves the cursor past mail that was not stored. Logs name the account, item IDs and error codes, never mail or
 * tokens.
 */
@Component
class ImportRunner implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(ImportRunner.class);

    private final ProviderAccess access;
    private final ConversationStore store;
    private final SyncCheckpoints checkpoints;
    private final TransactionTemplate transactions;
    private final InitialSyncProperties properties;
    // One virtual thread per running import (D-69): an import mostly waits for the provider. Kept here rather than
    // as a bean, so Spring Boot keeps its own task executor.
    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("initial-sync-", 0).factory());
    // Requests per account not handled yet: the first starts a worker, later ones make that worker look at the row
    // again when it is done, so none is lost and two workers never run one account.
    private final Map<UUID, AtomicInteger> requests = new ConcurrentHashMap<>();

    ImportRunner(ProviderAccess access, ConversationStore store, SyncCheckpoints checkpoints,
            TransactionTemplate transactions, InitialSyncProperties properties) {
        this.access = access;
        this.store = store;
        this.checkpoints = checkpoints;
        this.transactions = transactions;
        this.properties = properties;
    }

    /** Has the import of the account go on in the background if its row is RUNNING; harmless if it already does. */
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
     * Interrupts the running imports when the application closes. Their rows stay RUNNING, and {@link ImportResumer}
     * goes on with them at the next start.
     */
    @Override
    public void destroy() {
        executor.shutdownNow();
    }

    private void work(UUID accountId, AtomicInteger pending) {
        while (true) {
            run(accountId);
            if (Thread.currentThread().isInterrupted()) {
                // This thread is being stopped; what was asked meanwhile goes to a fresh one, unless closing.
                if (pending.getAndSet(0) > 1) {
                    submit(accountId);
                }
                return;
            }
            if (pending.decrementAndGet() == 0) {
                return;
            }
        }
    }

    private void run(UUID accountId) {
        try {
            Checkpoint checkpoint = checkpoints.find(accountId).orElse(null);
            if (checkpoint == null || !"RUNNING".equals(checkpoint.status())) {
                return;
            }
            checkpoints.beginRun(accountId);
            log.info("Initial sync of account {} runs ({}, {} messages imported so far)", accountId,
                    checkpoint.range(), checkpoint.imported());
            if (checkpoint.estimated() == null) {
                estimate(checkpoint);
            }
            importPages(accountId);
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
            log.info("Initial sync of account {} stopped; it goes on at the next start", accountId);
        } catch (SinoException failure) {
            // ProviderAccess: the account was removed or turned off, or its connector is gone.
            fail(accountId, failure.errorCode().code());
        } catch (RuntimeException failure) {
            if (Thread.currentThread().isInterrupted()) {
                log.info("Initial sync of account {} stopped; it goes on at the next start", accountId);
                return;
            }
            log.error("Initial sync of account {} failed", accountId, failure);
            fail(accountId, "INTERNAL");
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

    private void importPages(UUID accountId) throws InterruptedException {
        int throttled = 0;
        int unreachable = 0;
        boolean startedOver = false;
        while (!Thread.currentThread().isInterrupted()) {
            Checkpoint checkpoint = checkpoints.find(accountId).orElseThrow();
            SyncCursor cursor = checkpoint.cursor() == null ? SyncCursor.initial(checkpoint.since())
                    : new SyncCursor(checkpoint.cursor());
            SyncBatch batch;
            try {
                batch = access.call(accountId, (connector, context) -> connector.fetchUpdates(context, cursor));
            } catch (ProviderException failure) {
                switch (failure.errorCode()) {
                    case RATE_LIMITED -> {
                        if (++throttled > properties.rateLimitAttempts()) {
                            fail(accountId, failure.errorCode().name());
                            return;
                        }
                        Duration wait = failure.retryAfter().orElse(properties.rateLimitWait());
                        pause(accountId, failure, wait.compareTo(properties.rateLimitMaxWait()) > 0
                                ? properties.rateLimitMaxWait() : wait);
                    }
                    case PROVIDER_UNAVAILABLE -> {
                        if (unreachable >= properties.unavailableWaits().size()) {
                            fail(accountId, failure.errorCode().name());
                            return;
                        }
                        pause(accountId, failure, properties.unavailableWaits().get(unreachable++));
                    }
                    // D-60: the provider no longer knows the cursor; reading again from the start is safe once,
                    // since storing is idempotent.
                    case CURSOR_EXPIRED -> {
                        if (startedOver) {
                            fail(accountId, failure.errorCode().name());
                            return;
                        }
                        startedOver = true;
                        log.warn("Initial sync of account {} starts over: {}", accountId, failure.errorCode());
                        checkpoints.startOver(accountId);
                    }
                    default -> {
                        fail(accountId, failure.errorCode().name());
                        return;
                    }
                }
                continue;
            }
            boolean done = !batch.hasMore();
            // A connector that says there is more but gives back the same cursor would be asked forever.
            if (!done && batch.nextCursor().value().equals(cursor.value())) {
                fail(accountId, "CURSOR_STUCK");
                return;
            }
            transactions.executeWithoutResult(status -> {
                StoreResult stored = store.store(accountId, batch);
                checkpoints.advance(accountId, batch.nextCursor().value(), stored.newMessages()
                        + stored.updatedMessages(), batch.skipped().size(), done);
            });
            if (!batch.skipped().isEmpty()) {
                log.warn("Initial sync of account {} skipped {}", accountId, batch.skipped().stream()
                        .map(item -> item.externalId() + " (" + item.reason() + ")").collect(Collectors.joining(", ")));
            }
            throttled = 0;
            unreachable = 0;
            if (done) {
                log.info("Initial sync of account {} is done", accountId);
                return;
            }
        }
        throw new InterruptedException();
    }

    private static void pause(UUID accountId, ProviderException failure, Duration wait) throws InterruptedException {
        log.warn("Initial sync of account {} waits {} ms: {}", accountId, wait.toMillis(), failure.errorCode());
        Thread.sleep(wait);
    }

    // A stopping thread leaves the row RUNNING (design, section 3); a failure to record the failure is only logged,
    // and the next start takes the row up again.
    private void fail(UUID accountId, String errorCode) {
        if (Thread.currentThread().isInterrupted()) {
            log.info("Initial sync of account {} stopped; it goes on at the next start", accountId);
            return;
        }
        log.warn("Initial sync of account {} failed: {}", accountId, errorCode);
        try {
            checkpoints.fail(accountId, errorCode);
        } catch (RuntimeException failure) {
            log.error("Initial sync of account {}: the failure could not be recorded", accountId, failure);
        }
    }

}
