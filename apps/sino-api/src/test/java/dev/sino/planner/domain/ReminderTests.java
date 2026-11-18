package dev.sino.planner.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ReminderTests {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");

    @ParameterizedTest
    @ValueSource(ints = { 0, 5, 15, 30, 60, 1440 })
    void aTimedStartAllowsItsOffsetsAndNotTheWholeDayOnes(int offset) {
        assertThat(Reminder.isAllowed(offset, false)).isTrue();
        assertThat(Reminder.isAllowed(offset, true)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(ints = { -540, 900 })
    void aWholeDayAllowsItsOffsetsAndNotTheTimedOnes(int offset) {
        assertThat(Reminder.isAllowed(offset, true)).isTrue();
        assertThat(Reminder.isAllowed(offset, false)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(ints = { -1, 7, 10, 120, 1441 })
    void otherOffsetsAreRefused(int offset) {
        assertThat(Reminder.isAllowed(offset, false)).isFalse();
        assertThat(Reminder.isAllowed(offset, true)).isFalse();
        assertThatIllegalArgumentException().isThrownBy(() -> new Reminder(offset));
    }

    @Test
    void aTimedReminderFiresThatManyMinutesBeforeTheStart() {
        Instant start = Instant.parse("2026-12-20T03:00:00Z");

        assertThat(new Reminder(15).firesBefore(start)).isEqualTo(Instant.parse("2026-12-20T02:45:00Z"));
        assertThat(new Reminder(0).firesBefore(start)).isEqualTo(start);
        assertThat(new Reminder(1440).firesBefore(start)).isEqualTo(Instant.parse("2026-12-19T03:00:00Z"));
    }

    @Test
    void aWholeDayCountsBackFromMidnightInTheZoneOfThePlanner() {
        LocalDate day = LocalDate.parse("2026-12-20");

        // 00:00 on the 20th is 17:00Z on the 19th; -540 is 9:00 that day, 900 is 9:00 the day before.
        assertThat(new Reminder(-540).firesBefore(day, VIETNAM)).isEqualTo(Instant.parse("2026-12-20T02:00:00Z"));
        assertThat(new Reminder(900).firesBefore(day, VIETNAM)).isEqualTo(Instant.parse("2026-12-19T02:00:00Z"));
    }

}
