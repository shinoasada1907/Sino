package dev.sino.sync.application;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import dev.sino.conversation.SentMessages;

/**
 * The clocks of automatic sync (BE-49), of the watches (BE-51) and of settling sends (D-132): due accounts every
 * {@code sino.sync.live.tick} (15 s) after the last run ended; watches every {@code push-check} (1 hour), the first
 * time {@code push-check-delay} (1 min) after the start, so accounts imported before are watched soon; sends that got
 * no answer every {@code sent-check} (1 min). Left out of the application when {@code sino.sync.live.scheduled} is
 * false, as in the tests, which call {@link LiveSyncScheduler}, {@link PushWatches} and {@code SentMessages}
 * themselves.
 */
@Component
@ConditionalOnProperty(name = "sino.sync.live.scheduled", havingValue = "true", matchIfMissing = true)
class LiveSyncSchedule implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(LiveSyncSchedule.class);

    private final LiveSyncScheduler scheduler;
    private final PushWatches watches;
    private final SentMessages sent;
    // Checking the watches calls the provider for each due account, seconds each when it is slow: on a thread of its
    // own, so the single scheduling thread goes on ticking. One check at a time.
    private final ExecutorService watchChecks = Executors.newSingleThreadExecutor(
            Thread.ofVirtual().name("push-watch-check-", 0).factory());
    private final AtomicBoolean checkingWatches = new AtomicBoolean();
    // The same for settling sends that got no answer.
    private final ExecutorService sentChecks = Executors.newSingleThreadExecutor(
            Thread.ofVirtual().name("sent-message-check-", 0).factory());
    private final AtomicBoolean checkingSent = new AtomicBoolean();
    // Only the scheduling thread runs tick().
    private boolean failing;
    // Only the thread of watchChecks runs renewWatches().
    private boolean watchesFailing;
    // Only the thread of sentChecks runs settleSends().
    private boolean sentFailing;

    LiveSyncSchedule(LiveSyncScheduler scheduler, PushWatches watches, SentMessages sent) {
        this.scheduler = scheduler;
        this.watches = watches;
        this.sent = sent;
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

    /** Starts a check of the watches in the background and returns; nothing when the last one still runs. */
    @Scheduled(fixedDelayString = "${sino.sync.live.push-check:PT1H}",
            initialDelayString = "${sino.sync.live.push-check-delay:PT1M}")
    void checkWatches() {
        if (!checkingWatches.compareAndSet(false, true)) {
            return;
        }
        try {
            watchChecks.execute(() -> {
                try {
                    renewWatches();
                } finally {
                    checkingWatches.set(false);
                }
            });
        } catch (RejectedExecutionException closing) {
            checkingWatches.set(false);
        }
    }

    void renewWatches() {
        try {
            watches.renewDueWatches();
            if (watchesFailing) {
                watchesFailing = false;
                log.info("Watches are checked again");
            }
        } catch (RuntimeException failure) {
            if (!watchesFailing) {
                watchesFailing = true;
                log.warn("Watches cannot be checked: {}", failure.toString());
            }
        }
    }

    /**
     * Starts settling the sends that got no answer in the background and returns (D-132); nothing when the last round
     * still runs. A sync settles its own account too, but a paused, failing or importing account is not synced.
     */
    @Scheduled(fixedDelayString = "${sino.sync.live.sent-check:PT1M}",
            initialDelayString = "${sino.sync.live.sent-check:PT1M}")
    void checkSentMessages() {
        if (!checkingSent.compareAndSet(false, true)) {
            return;
        }
        try {
            sentChecks.execute(() -> {
                try {
                    settleSends();
                } finally {
                    checkingSent.set(false);
                }
            });
        } catch (RejectedExecutionException closing) {
            checkingSent.set(false);
        }
    }

    void settleSends() {
        try {
            sent.reconcileAll();
            if (sentFailing) {
                sentFailing = false;
                log.info("Sent messages are settled again");
            }
        } catch (RuntimeException failure) {
            if (!sentFailing) {
                sentFailing = true;
                log.warn("Sent messages cannot be settled: {}", failure.toString());
            }
        }
    }

    /** Stops a check under way when the application closes: a registration it interrupts records nothing. */
    @Override
    public void destroy() {
        watchChecks.shutdownNow();
        sentChecks.shutdownNow();
    }

}
