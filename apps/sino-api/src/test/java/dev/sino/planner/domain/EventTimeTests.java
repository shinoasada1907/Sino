package dev.sino.planner.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class EventTimeTests {

    private static final Instant NINE = Instant.parse("2026-10-05T02:00:00Z");

    @Test
    void aTimedSpanKeepsItsEnds() {
        EventTime time = EventTime.timed(NINE, NINE.plusSeconds(3600));

        assertThat(time.isWholeDays()).isFalse();
        assertThat(time.startDate()).isNull();
        assertThat(time.startDay(ZoneId.of("Asia/Ho_Chi_Minh"))).isEqualTo(LocalDate.parse("2026-10-05"));
    }

    @Test
    void theStartDayFollowsTheZone() {
        EventTime time = EventTime.timed(Instant.parse("2026-10-05T20:00:00Z"), Instant.parse("2026-10-05T21:00:00Z"));

        assertThat(time.startDay(ZoneId.of("UTC"))).isEqualTo(LocalDate.parse("2026-10-05"));
        assertThat(time.startDay(ZoneId.of("Asia/Ho_Chi_Minh"))).isEqualTo(LocalDate.parse("2026-10-06"));
    }

    @Test
    void wholeDaysAreTheSameDaysEverywhere() {
        EventTime time = EventTime.wholeDays(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-02"));

        assertThat(time.isWholeDays()).isTrue();
        assertThat(time.startDay(ZoneId.of("Pacific/Auckland"))).isEqualTo(LocalDate.parse("2026-10-01"));
    }

    @Test
    void fourteenDaysAreAllowedInBothKinds() {
        EventTime.timed(NINE, NINE.plusSeconds(14 * 24 * 3600L));
        EventTime.wholeDays(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-15"));
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({
            "timed, 2026-10-05T02:00:00Z, 2026-10-05T01:00:00Z",
            "timed with no length, 2026-10-05T02:00:00Z, 2026-10-05T02:00:00Z",
            "timed for 14 days and a second, 2026-10-05T02:00:00Z, 2026-10-19T02:00:01Z" })
    void aBadTimedSpanIsRefused(String name, Instant start, Instant end) {
        assertThatThrownBy(() -> EventTime.timed(start, end)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({
            "end before start, 2026-10-05, 2026-10-04",
            "no length, 2026-10-05, 2026-10-05",
            "15 days, 2026-10-01, 2026-10-16" })
    void aBadWholeDaySpanIsRefused(String name, LocalDate start, LocalDate end) {
        assertThatThrownBy(() -> EventTime.wholeDays(start, end)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void yearsOutside1900To2200AreRefused() {
        assertThatThrownBy(() -> EventTime.wholeDays(LocalDate.parse("9999-01-01"), LocalDate.parse("9999-01-02")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EventTime.wholeDays(LocalDate.parse("1899-12-31"), LocalDate.parse("1900-01-02")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EventTime.timed(Instant.parse("2200-12-31T23:00:00Z"), Instant.parse("2201-01-01T01:00:00Z")))
                .isInstanceOf(IllegalArgumentException.class);
        // The edges are fine: the last whole day of 2200 ends on 01/01/2201.
        EventTime.wholeDays(LocalDate.parse("2200-12-31"), LocalDate.parse("2201-01-01"));
        EventTime.wholeDays(LocalDate.parse("1900-01-01"), LocalDate.parse("1900-01-02"));
    }

    @Test
    void halfASpanOrBothKindsOrNoneIsRefused() {
        LocalDate day = LocalDate.parse("2026-10-05");

        assertThatThrownBy(() -> new EventTime(NINE, null, null, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EventTime(null, null, day, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EventTime(NINE, NINE.plusSeconds(60), day, day.plusDays(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EventTime(null, null, null, null)).isInstanceOf(IllegalArgumentException.class);
    }

}
