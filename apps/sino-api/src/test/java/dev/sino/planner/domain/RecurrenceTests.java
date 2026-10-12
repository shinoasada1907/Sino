package dev.sino.planner.domain;

import static java.time.DayOfWeek.FRIDAY;
import static java.time.DayOfWeek.MONDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import dev.sino.common.error.SinoException;

class RecurrenceTests {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");

    private static Recurrence rule(Frequency frequency, Set<DayOfWeek> weekdays, Integer monthDay, LocalDate until,
            Integer count) {
        return new Recurrence(frequency, 1, weekdays, monthDay, until, count, VIETNAM);
    }

    @Test
    void theIntervalIsFromOneTo99() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new Recurrence(Frequency.DAILY, 0, null, null, null, null, VIETNAM));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new Recurrence(Frequency.DAILY, 100, null, null, null, null, VIETNAM));
        assertThat(new Recurrence(Frequency.DAILY, 99, null, null, null, null, VIETNAM).interval()).isEqualTo(99);
    }

    @Test
    void theCountIsFromOneTo999() {
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.DAILY, null, null, null, 0));
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.DAILY, null, null, null, 1000));
        assertThat(rule(Frequency.DAILY, null, null, null, 999).count()).isEqualTo(999);
    }

    @Test
    void aRuleEndsOnADayOrAfterACountButNotBoth() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> rule(Frequency.DAILY, null, null, LocalDate.parse("2026-12-31"), 10));
    }

    @Test
    void aWeeklyRuleHasAtLeastOneWeekday() {
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.WEEKLY, Set.of(), null, null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.WEEKLY, null, null, null, null));
    }

    @Test
    void onlyAWeeklyRuleHasWeekdays() {
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.DAILY, Set.of(MONDAY), null, null, null));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> rule(Frequency.MONTHLY, Set.of(MONDAY), null, null, null));
    }

    @Test
    void onlyAMonthlyOrYearlyRuleHasADayOfTheMonth() {
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.DAILY, null, 5, null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.WEEKLY, Set.of(MONDAY), 5, null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.MONTHLY, null, 0, null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> rule(Frequency.MONTHLY, null, 32, null, null));
        assertThat(rule(Frequency.YEARLY, null, 31, null, null).byMonthDay()).isEqualTo(31);
    }

    @Test
    void theWeekdaysCannotBeChangedFromOutside() {
        Set<DayOfWeek> days = EnumSet.of(MONDAY);
        Recurrence weekly = rule(Frequency.WEEKLY, days, null, null, null);

        days.add(FRIDAY);

        assertThat(weekly.byWeekdays()).containsExactly(MONDAY);
        assertThatThrownBy(() -> weekly.byWeekdays().add(FRIDAY)).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void aWeeklyRuleMustHoldTheWeekdayOfItsFirstDate() {
        Recurrence mondaysAndFridays = rule(Frequency.WEEKLY, Set.of(MONDAY, FRIDAY), null, null, null);

        assertThatThrownBy(() -> mondaysAndFridays.anchoredAt(LocalDate.parse("2026-10-07")))
                .isInstanceOfSatisfying(SinoException.class,
                        e -> assertThat(e.errorCode()).isEqualTo(PlannerErrorCode.INVALID_RECURRENCE));
        assertThat(mondaysAndFridays.anchoredAt(LocalDate.parse("2026-10-09"))).isEqualTo(mondaysAndFridays);
    }

    @Test
    void aMissingDayOfTheMonthIsTakenFromTheFirstDate() {
        Recurrence monthly = rule(Frequency.MONTHLY, null, null, null, null);

        assertThat(monthly.anchoredAt(LocalDate.parse("2026-10-31")).byMonthDay()).isEqualTo(31);
        assertThat(rule(Frequency.YEARLY, null, null, null, null).anchoredAt(LocalDate.parse("2028-02-29"))
                .byMonthDay()).isEqualTo(29);
    }

    @Test
    void theDayOfTheMonthMustBeTheDayOfTheFirstDate() {
        assertThatThrownBy(() -> rule(Frequency.MONTHLY, null, 15, null, null).anchoredAt(LocalDate.parse("2026-10-14")))
                .isInstanceOf(SinoException.class);
        assertThatThrownBy(() -> rule(Frequency.MONTHLY, null, 15, null, null).anchoredAt(LocalDate.parse("2026-10-16")))
                .isInstanceOf(SinoException.class);
    }

    @Test
    void aLargerDayOfTheMonthFitsAFirstDateOnTheLastDayOfItsMonth() {
        assertThat(rule(Frequency.MONTHLY, null, 31, null, null).anchoredAt(LocalDate.parse("2026-11-30")).byMonthDay())
                .isEqualTo(31);
        assertThat(rule(Frequency.YEARLY, null, 29, null, null).anchoredAt(LocalDate.parse("2029-02-28")).byMonthDay())
                .isEqualTo(29);
        assertThatThrownBy(() -> rule(Frequency.MONTHLY, null, 31, null, null).anchoredAt(LocalDate.parse("2026-11-29")))
                .isInstanceOf(SinoException.class);
    }

    @Test
    void aSmallerDayOfTheMonthDoesNotFitAFirstDateOnTheLastDayOfItsMonth() {
        assertThatThrownBy(() -> rule(Frequency.MONTHLY, null, 15, null, null).anchoredAt(LocalDate.parse("2026-11-30")))
                .isInstanceOf(SinoException.class);
    }

    @Test
    void theLastDayCannotBeBeforeTheFirstDate() {
        Recurrence untilTheFifth = rule(Frequency.DAILY, null, null, LocalDate.parse("2026-10-05"), null);

        assertThatThrownBy(() -> untilTheFifth.anchoredAt(LocalDate.parse("2026-10-06")))
                .isInstanceOf(SinoException.class);
        assertThat(untilTheFifth.anchoredAt(LocalDate.parse("2026-10-05"))).isEqualTo(untilTheFifth);
    }

    @Test
    void theLocalTimeStaysTheSameAcrossADaylightSavingChange() {
        ZoneId berlin = ZoneId.of("Europe/Berlin");
        Recurrence mondays = new Recurrence(Frequency.WEEKLY, 1, Set.of(MONDAY), null, null, null, berlin);

        // Germany leaves summer time on Sunday 25 October 2026.
        assertThat(mondays.instantAt(LocalDate.parse("2026-10-19"), LocalTime.of(9, 0)))
                .isEqualTo(Instant.parse("2026-10-19T07:00:00Z"));
        assertThat(mondays.instantAt(LocalDate.parse("2026-10-26"), LocalTime.of(9, 0)))
                .isEqualTo(Instant.parse("2026-10-26T08:00:00Z"));
    }

}
