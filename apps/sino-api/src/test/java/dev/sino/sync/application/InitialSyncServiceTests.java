package dev.sino.sync.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import org.junit.jupiter.api.Test;

/** The minutes left of a running import (F05 design, section 3). */
class InitialSyncServiceTests {

    private static final Duration TWO_MINUTES = Duration.ofMinutes(2);

    @Test
    void theRestAtTheSpeedOfThisRun() {
        // 400 messages in 2 minutes: 200 a minute, 600 left.
        assertThat(InitialSyncService.remainingMinutes("RUNNING", 1000L, 400, 400, TWO_MINUTES)).isEqualTo(3);
        assertThat(InitialSyncService.remainingMinutes("RUNNING", 1000L, 401, 400, TWO_MINUTES)).isEqualTo(3);
        assertThat(InitialSyncService.remainingMinutes("RUNNING", 1000L, 399, 400, TWO_MINUTES)).isEqualTo(4);
    }

    @Test
    void anImportThatWentOnCountsOnlyThisRunForItsSpeed() {
        // 900 imported in all, 100 of them in the last minute: 100 a minute, 100 left.
        assertThat(InitialSyncService.remainingMinutes("RUNNING", 1000L, 900, 100, Duration.ofMinutes(1)))
                .isEqualTo(1);
    }

    @Test
    void moreThanTheEstimateLeavesNoMinutes() {
        assertThat(InitialSyncService.remainingMinutes("RUNNING", 1000L, 1200, 1200, TWO_MINUTES)).isZero();
    }

    @Test
    void noMinutesWithoutAnEstimateASpeedOrARunningImport() {
        assertThat(InitialSyncService.remainingMinutes("RUNNING", null, 400, 400, TWO_MINUTES)).isNull();
        assertThat(InitialSyncService.remainingMinutes("RUNNING", 1000L, 0, 0, TWO_MINUTES)).isNull();
        assertThat(InitialSyncService.remainingMinutes("RUNNING", 1000L, 10, 10, Duration.ofSeconds(4))).isNull();
        assertThat(InitialSyncService.remainingMinutes("RUNNING", 1000L, 10, 10, Duration.ofSeconds(5))).isNotNull();
        assertThat(InitialSyncService.remainingMinutes("DONE", 1000L, 400, 400, TWO_MINUTES)).isNull();
        assertThat(InitialSyncService.remainingMinutes("FAILED", 1000L, 400, 400, TWO_MINUTES)).isNull();
    }

}
