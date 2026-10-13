package dev.sino.planner.api;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import dev.sino.planner.application.RepeatRule;
import dev.sino.planner.domain.Frequency;
import dev.sino.planner.domain.Recurrence;

/**
 * A repeat rule in JSON, as the web's {@code Recurrence} type: {@code freq}, every {@code interval}, the weekdays of a
 * weekly rule, the day of the month of a monthly or yearly rule (taken from the due when missing), and an end day or
 * a count. The time zone is Sino's and is not part of it. Used in requests and in responses.
 */
record RepeatBody(
        @NotNull Frequency freq,
        @NotNull @Min(1) @Max(Recurrence.MAX_INTERVAL) Integer interval,
        List<DayOfWeek> byWeekdays,
        @Min(1) @Max(31) Integer byMonthDay,
        LocalDate untilDate,
        @Min(1) @Max(Recurrence.MAX_COUNT) Integer count) {

    @AssertTrue(message = "give untilDate or count, not both")
    boolean isOneEndAtMost() {
        return untilDate == null || count == null;
    }

    @AssertTrue(message = "a WEEKLY rule names one or more weekdays, and only a WEEKLY rule names any")
    boolean isWeekdaysFitFrequency() {
        boolean named = byWeekdays != null && !byWeekdays.isEmpty();
        if (named && byWeekdays.stream().anyMatch(Objects::isNull)) {
            return false;
        }
        return freq == null || (freq == Frequency.WEEKLY) == named;
    }

    @AssertTrue(message = "byMonthDay is only for a MONTHLY or YEARLY rule")
    boolean isMonthDayFitFrequency() {
        return byMonthDay == null || freq == null || freq == Frequency.MONTHLY || freq == Frequency.YEARLY;
    }

    RepeatRule toRule() {
        // EnumSet.copyOf refuses an empty list, which a daily rule may send.
        return new RepeatRule(freq, interval,
                byWeekdays == null || byWeekdays.isEmpty() ? null : EnumSet.copyOf(byWeekdays), byMonthDay,
                untilDate, count);
    }

    /** The rule of a stored task or event; no weekdays is {@code null}, as the web expects. */
    static RepeatBody from(Recurrence rule) {
        if (rule == null) {
            return null;
        }
        List<DayOfWeek> weekdays = rule.byWeekdays().isEmpty() ? null : List.copyOf(rule.byWeekdays());
        return new RepeatBody(rule.frequency(), rule.interval(), weekdays, rule.byMonthDay(), rule.untilDate(),
                rule.count());
    }

}
