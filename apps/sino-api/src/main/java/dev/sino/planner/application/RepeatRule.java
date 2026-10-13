package dev.sino.planner.application;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;

import dev.sino.planner.domain.Frequency;
import dev.sino.planner.domain.Recurrence;

/**
 * A repeat rule as a client sends it: everything of a {@link Recurrence} but the time zone, which is Sino's
 * ({@code sino.planner.time-zone}) when the rule is set (D-157).
 */
public record RepeatRule(Frequency frequency, int interval, Set<DayOfWeek> byWeekdays, Integer byMonthDay,
        LocalDate untilDate, Integer count) {

    Recurrence in(ZoneId zone) {
        return new Recurrence(frequency, interval, byWeekdays, byMonthDay, untilDate, count, zone);
    }

}
