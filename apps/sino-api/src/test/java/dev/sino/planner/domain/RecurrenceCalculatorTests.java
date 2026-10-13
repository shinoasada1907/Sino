package dev.sino.planner.domain;

import static java.time.DayOfWeek.FRIDAY;
import static java.time.DayOfWeek.MONDAY;
import static java.time.DayOfWeek.SUNDAY;
import static java.time.DayOfWeek.THURSDAY;
import static java.time.DayOfWeek.WEDNESDAY;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class RecurrenceCalculatorTests {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");

    private static LocalDate d(String date) {
        return LocalDate.parse(date);
    }

    private static Recurrence daily(int interval, Integer count) {
        return new Recurrence(Frequency.DAILY, interval, null, null, null, count, VIETNAM);
    }

    private static Recurrence weekly(int interval, Set<DayOfWeek> days) {
        return new Recurrence(Frequency.WEEKLY, interval, days, null, null, null, VIETNAM);
    }

    private static Recurrence monthly(int interval, Integer monthDay) {
        return new Recurrence(Frequency.MONTHLY, interval, null, monthDay, null, null, VIETNAM);
    }

    private static Recurrence yearly(Integer monthDay) {
        return yearly(1, monthDay);
    }

    private static Recurrence yearly(int interval, Integer monthDay) {
        return new Recurrence(Frequency.YEARLY, interval, null, monthDay, null, null, VIETNAM);
    }

    private static List<LocalDate> datesBetween(Recurrence rule, String anchor, String from, String to) {
        return RecurrenceCalculator.between(rule, new Occurrence(0, d(anchor)), d(from), d(to)).stream()
                .map(Occurrence::date)
                .toList();
    }

    static Stream<Arguments> occurrences() {
        return Stream.of(
                Arguments.of("every day", daily(1, null), "2026-10-01", "2026-10-01", "2026-10-05",
                        List.of("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04")),
                Arguments.of("every third day", daily(3, null), "2026-10-01", "2026-10-01", "2026-10-11",
                        List.of("2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10")),
                Arguments.of("Mondays and Thursdays every two weeks", weekly(2, Set.of(MONDAY, THURSDAY)),
                        "2026-10-05", "2026-10-01", "2026-11-06",
                        List.of("2026-10-05", "2026-10-08", "2026-10-19", "2026-10-22", "2026-11-02", "2026-11-05")),
                Arguments.of("days of the first week before the anchor are not occurrences",
                        weekly(1, Set.of(MONDAY, WEDNESDAY, SUNDAY)), "2026-10-07", "2026-10-05", "2026-10-15",
                        List.of("2026-10-07", "2026-10-11", "2026-10-12", "2026-10-14")),
                Arguments.of("the 31st falls back to the end of short months and comes back", monthly(1, 31),
                        "2026-10-31", "2026-10-01", "2027-04-01",
                        List.of("2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31")),
                Arguments.of("every two months", monthly(2, 15), "2026-10-15", "2026-10-01", "2027-04-01",
                        List.of("2026-10-15", "2026-12-15", "2027-02-15")),
                Arguments.of("the 29th of February falls on the 28th in common years", yearly(29),
                        "2028-02-29", "2028-01-01", "2033-01-01",
                        List.of("2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29")),
                Arguments.of("every two years", yearly(2, 15), "2026-03-15", "2026-01-01", "2033-01-01",
                        List.of("2026-03-15", "2028-03-15", "2030-03-15", "2032-03-15")),
                Arguments.of("a range far from the anchor", daily(1, null), "2020-01-01", "2026-10-01", "2026-10-08",
                        List.of("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06",
                                "2026-10-07")),
                Arguments.of("every third day, far from the anchor", daily(3, null), "2026-01-01", "2026-10-01",
                        "2026-10-08", List.of("2026-10-01", "2026-10-04", "2026-10-07")),
                Arguments.of("every two months, far from the anchor", monthly(2, 15), "2026-01-15", "2027-01-01",
                        "2027-04-01", List.of("2027-01-15", "2027-03-15")),
                Arguments.of("every two years, far from the anchor", yearly(2, 15), "2020-03-15", "2030-01-01",
                        "2031-01-01", List.of("2030-03-15")),
                Arguments.of("every two weeks from a Wednesday, far from the anchor",
                        weekly(2, Set.of(MONDAY, WEDNESDAY, FRIDAY)), "2026-10-07", "2027-01-01", "2027-01-15",
                        List.of("2027-01-01", "2027-01-11", "2027-01-13")),
                Arguments.of("a range after the last of the count", daily(1, 5), "2026-10-01", "2026-10-06",
                        "2026-10-13", List.of()),
                Arguments.of("the end of the range is left out", daily(1, null), "2026-10-01", "2026-10-03",
                        "2026-10-04", List.of("2026-10-03")),
                Arguments.of("a range before the anchor", daily(1, null), "2026-10-10", "2026-10-01", "2026-10-10",
                        List.of()));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("occurrences")
    void occurrencesOfARange(String name, Recurrence rule, String anchor, String from, String to,
            List<String> expected) {
        assertThat(datesBetween(rule, anchor, from, to)).containsExactlyElementsOf(
                expected.stream().map(LocalDate::parse).toList());
    }

    @Test
    void everyOccurrenceKnowsItsPlaceInTheSeries() {
        List<Occurrence> found = RecurrenceCalculator.between(weekly(2, Set.of(MONDAY, THURSDAY)),
                new Occurrence(0, d("2026-10-05")), d("2026-10-19"), d("2026-11-03"));

        assertThat(found).containsExactly(new Occurrence(2, d("2026-10-19")), new Occurrence(3, d("2026-10-22")),
                new Occurrence(4, d("2026-11-02")));
    }

    @Test
    void anAnchorLaterInTheSeriesKeepsItsIndexAndTheRemainingCount() {
        Recurrence fiveDays = daily(1, 5);

        List<Occurrence> found = RecurrenceCalculator.between(fiveDays, new Occurrence(3, d("2026-10-04")),
                d("2026-10-01"), d("2026-10-31"));

        assertThat(found).containsExactly(new Occurrence(3, d("2026-10-04")), new Occurrence(4, d("2026-10-05")));
    }

    @Test
    void anOccurrenceOnTheLastDayIsKept() {
        Recurrence untilTheFourth = new Recurrence(Frequency.DAILY, 1, null, null, d("2026-10-04"), null, VIETNAM);

        assertThat(datesBetween(untilTheFourth, "2026-10-01", "2026-10-01", "2026-10-31"))
                .containsExactly(d("2026-10-01"), d("2026-10-02"), d("2026-10-03"), d("2026-10-04"));
    }

    @Test
    void aRangeOfOneDayFindsAnOccurrenceMovedToTheEndOfTheMonth() {
        assertThat(datesBetween(monthly(1, 31), "2026-10-31", "2026-11-30", "2026-12-01"))
                .containsExactly(d("2026-11-30"));
    }

    static Stream<Arguments> nextOccurrences() {
        return Stream.of(
                Arguments.of("a week later", weekly(1, Set.of(MONDAY)), 0, "2026-10-05", "2026-10-07",
                        new Occurrence(1, d("2026-10-12"))),
                Arguments.of("late by several weeks: missed ones are skipped but counted", weekly(1, Set.of(MONDAY)), 0,
                        "2026-10-05", "2026-10-21", new Occurrence(3, d("2026-10-26"))),
                Arguments.of("done before it was due", weekly(1, Set.of(MONDAY)), 0, "2026-10-05", "2026-10-02",
                        new Occurrence(1, d("2026-10-12"))),
                Arguments.of("an occurrence of today is not before today", daily(1, null), 0, "2026-10-01",
                        "2026-10-05", new Occurrence(4, d("2026-10-05"))),
                Arguments.of("from the end of a short month back to the 31st", monthly(1, 31), 1, "2026-11-30",
                        "2026-11-30", new Occurrence(2, d("2026-12-31"))),
                Arguments.of("the next of Monday in a Monday and Thursday rule", weekly(2, Set.of(MONDAY, THURSDAY)), 2,
                        "2026-10-19", "2026-10-19", new Occurrence(3, d("2026-10-22"))));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("nextOccurrences")
    void nextOccurrence(String name, Recurrence rule, int index, String date, String today, Occurrence expected) {
        assertThat(RecurrenceCalculator.nextAfter(rule, new Occurrence(index, d(date)), d(today))).contains(expected);
    }

    @Test
    void noNextOccurrenceAfterTheLastOfTheCount() {
        assertThat(RecurrenceCalculator.nextAfter(daily(1, 3), new Occurrence(2, d("2026-10-03")), d("2026-10-03")))
                .isEmpty();
    }

    @Test
    void noNextOccurrenceAfterTheLastDay() {
        Recurrence untilTheFourth = new Recurrence(Frequency.DAILY, 1, null, null, d("2026-10-04"), null, VIETNAM);

        assertThat(RecurrenceCalculator.nextAfter(untilTheFourth, new Occurrence(0, d("2026-10-01")), d("2026-10-05")))
                .isEmpty();
    }

    @Test
    void skippedOccurrencesUseUpTheCount() {
        assertThat(RecurrenceCalculator.nextAfter(daily(1, 3), new Occurrence(0, d("2026-10-01")), d("2026-10-10")))
                .isEmpty();
    }

}
