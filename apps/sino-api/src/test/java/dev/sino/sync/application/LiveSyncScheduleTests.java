package dev.sino.sync.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.DataAccessResourceFailureException;

@ExtendWith(OutputCaptureExtension.class)
class LiveSyncScheduleTests {

    @Test
    void aScanThatFailsIsLoggedOnceAndTheScheduleGoesOn(CapturedOutput output) {
        LiveSyncScheduler scheduler = mock(LiveSyncScheduler.class);
        doThrow(new DataAccessResourceFailureException("database down")).doThrow(
                new DataAccessResourceFailureException("database down")).doNothing().when(scheduler).syncDueAccounts();
        LiveSyncSchedule schedule = new LiveSyncSchedule(scheduler);

        assertThatNoException().isThrownBy(() -> {
            schedule.tick();
            schedule.tick();
            schedule.tick();
        });

        assertThat(output.getAll().split("Automatic sync cannot look for due accounts", -1)).hasSize(2);
        assertThat(output.getAll()).contains("Automatic sync looks for due accounts again");
    }

}
