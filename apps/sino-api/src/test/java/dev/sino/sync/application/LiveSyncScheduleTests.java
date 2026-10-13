package dev.sino.sync.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.DataAccessResourceFailureException;

import dev.sino.conversation.SentMessages;

@ExtendWith(OutputCaptureExtension.class)
class LiveSyncScheduleTests {

    private final LiveSyncScheduler scheduler = mock(LiveSyncScheduler.class);
    private final PushWatches watches = mock(PushWatches.class);
    private final SentMessages sent = mock(SentMessages.class);
    private final LiveSyncSchedule schedule = new LiveSyncSchedule(scheduler, watches, sent);

    @AfterEach
    void closeTheSchedule() {
        schedule.destroy();
    }

    @Test
    void aScanThatFailsIsLoggedOnceAndTheScheduleGoesOn(CapturedOutput output) {
        doThrow(new DataAccessResourceFailureException("database down")).doThrow(
                new DataAccessResourceFailureException("database down")).doNothing().when(scheduler).syncDueAccounts();

        assertThatNoException().isThrownBy(() -> {
            schedule.tick();
            schedule.tick();
            schedule.tick();
        });

        assertThat(output.getAll().split("Automatic sync cannot look for due accounts", -1)).hasSize(2);
        assertThat(output.getAll()).contains("Automatic sync looks for due accounts again");
    }

    @Test
    void aCheckOfTheWatchesThatFailsIsLoggedOnceAndTheScheduleGoesOn(CapturedOutput output) {
        doThrow(new DataAccessResourceFailureException("database down")).doThrow(
                new DataAccessResourceFailureException("database down")).doNothing().when(watches).renewDueWatches();

        assertThatNoException().isThrownBy(() -> {
            schedule.renewWatches();
            schedule.renewWatches();
            schedule.renewWatches();
        });

        assertThat(output.getAll().split("Watches cannot be checked", -1)).hasSize(2);
        assertThat(output.getAll()).contains("Watches are checked again");
    }

    // The scheduling thread also ticks automatic sync: it never waits for a provider that answers slowly.
    @Test
    void aCheckOfTheWatchesRunsBesideTheScheduleOneAtATime() throws Exception {
        CountDownLatch slowProvider = new CountDownLatch(1);
        doAnswer(invocation -> slowProvider.await(10, TimeUnit.SECONDS)).when(watches).renewDueWatches();

        long started = System.nanoTime();
        schedule.checkWatches();
        verify(watches, timeout(5_000)).renewDueWatches();
        schedule.checkWatches();
        assertThat(Duration.ofNanos(System.nanoTime() - started)).as("returns at once").isLessThan(
                Duration.ofSeconds(5));
        Thread.sleep(100);
        verify(watches, times(1)).renewDueWatches();

        slowProvider.countDown();
        // Once the first check ended, the next one starts.
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (mockingDetails(watches).getInvocations().size() < 2 && System.nanoTime() < deadline) {
            schedule.checkWatches();
            Thread.sleep(20);
        }
        verify(watches, times(2)).renewDueWatches();
    }

    @Test
    void settlingSendsThatFailsIsLoggedOnceAndTheScheduleGoesOn(CapturedOutput output) {
        doThrow(new DataAccessResourceFailureException("database down")).doThrow(
                new DataAccessResourceFailureException("database down")).doNothing().when(sent).reconcileAll();

        assertThatNoException().isThrownBy(() -> {
            schedule.settleSends();
            schedule.settleSends();
            schedule.settleSends();
        });

        assertThat(output.getAll().split("Sent messages cannot be settled", -1)).hasSize(2);
        assertThat(output.getAll()).contains("Sent messages are settled again");
    }

    // Settling asks the provider about each message: never on the scheduling thread, one round at a time.
    @Test
    void settlingSendsRunsBesideTheScheduleOneRoundAtATime() throws Exception {
        CountDownLatch slowProvider = new CountDownLatch(1);
        doAnswer(invocation -> slowProvider.await(10, TimeUnit.SECONDS)).when(sent).reconcileAll();

        long started = System.nanoTime();
        schedule.checkSentMessages();
        verify(sent, timeout(5_000)).reconcileAll();
        schedule.checkSentMessages();
        assertThat(Duration.ofNanos(System.nanoTime() - started)).as("returns at once").isLessThan(
                Duration.ofSeconds(5));
        Thread.sleep(100);
        verify(sent, times(1)).reconcileAll();
        slowProvider.countDown();
    }

}
