package dev.sino.planner.domain;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;

import dev.sino.common.error.SinoException;

/**
 * A repeat rule of a task or an event (spec {@code recurrence}, D-152): every {@code interval} days, weeks, months or
 * years from a first date, the anchor, which is the first occurrence. A weekly rule names its weekdays; a monthly or
 * yearly rule keeps its day of the month, so a month without that day falls back to its last day and the next month
 * comes back to it. A rule may end on a day (included) or after a number of occurrences (the anchor counts), not both.
 * Times are local to {@code timeZone}, so a 9:00 rule stays at 9:00 across a daylight saving change.
 * <p>
 * The constructor refuses a malformed rule with {@link IllegalArgumentException}: the API checks the same limits
 * first, so reaching it is a bug. {@link #anchoredAt(LocalDate)} checks the rule against its anchor, which only the
 * time zone can tell, and reports a mismatch to the user.
 * <p>
 * Stored in the {@code rec_*} columns of the row that repeats (BE-71); a row whose columns are all empty has no rule.
 */
@Embeddable
public record Recurrence(
        @Enumerated(EnumType.STRING) @Column(name = "rec_freq") Frequency frequency,
        @Column(name = "rec_interval") int interval,
        @Convert(converter = WeekdaysConverter.class) @Column(name = "rec_by_weekdays") Set<DayOfWeek> byWeekdays,
        @Column(name = "rec_by_month_day") Integer byMonthDay,
        @Column(name = "rec_until_date") LocalDate untilDate,
        @Column(name = "rec_count") Integer count,
        @Convert(converter = ZoneIdConverter.class) @Column(name = "rec_time_zone") ZoneId timeZone) {

    public static final int MAX_INTERVAL = 99;
    public static final int MAX_COUNT = 999;

    public Recurrence {
        Objects.requireNonNull(frequency, "frequency");
        Objects.requireNonNull(timeZone, "timeZone");
        if (interval < 1 || interval > MAX_INTERVAL) {
            throw new IllegalArgumentException("interval must be from 1 to " + MAX_INTERVAL);
        }
        byWeekdays = byWeekdays == null || byWeekdays.isEmpty()
                ? Set.of()
                : Collections.unmodifiableSet(EnumSet.copyOf(byWeekdays));
        if ((frequency == Frequency.WEEKLY) == byWeekdays.isEmpty()) {
            throw new IllegalArgumentException("a weekly rule, and only a weekly rule, names its weekdays");
        }
        boolean hasMonthDay = frequency == Frequency.MONTHLY || frequency == Frequency.YEARLY;
        if (byMonthDay != null && (!hasMonthDay || byMonthDay < 1 || byMonthDay > 31)) {
            throw new IllegalArgumentException("only a monthly or yearly rule has a day of the month, from 1 to 31");
        }
        if (untilDate != null && count != null) {
            throw new IllegalArgumentException("a rule ends on a day or after a count, not both");
        }
        if (count != null && (count < 1 || count > MAX_COUNT)) {
            throw new IllegalArgumentException("count must be from 1 to " + MAX_COUNT);
        }
    }

    /**
     * This rule checked against its first date: a missing day of the month is taken from it.
     *
     * @throws SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the weekday of the anchor is not one of
     *         the rule, its day is not the rule's day of the month, or the rule ends before it
     */
    public Recurrence anchoredAt(LocalDate anchor) {
        if (untilDate != null && untilDate.isBefore(anchor)) {
            throw invalid("The repeat rule ends before its first date.");
        }
        if (frequency == Frequency.WEEKLY && !byWeekdays.contains(anchor.getDayOfWeek())) {
            throw invalid("The weekdays of the repeat rule do not include the weekday of its first date.");
        }
        if (frequency == Frequency.MONTHLY || frequency == Frequency.YEARLY) {
            if (byMonthDay == null) {
                return new Recurrence(frequency, interval, byWeekdays, anchor.getDayOfMonth(), untilDate, count,
                        timeZone);
            }
            boolean onTheDay = byMonthDay == anchor.getDayOfMonth();
            boolean movedToTheEndOfTheMonth = byMonthDay > anchor.getDayOfMonth()
                    && anchor.getDayOfMonth() == anchor.lengthOfMonth();
            if (!onTheDay && !movedToTheEndOfTheMonth) {
                throw invalid("The day of the month of the repeat rule is not the day of its first date.");
            }
        }
        return this;
    }

    /** The instant of {@code time} on {@code date} in the rule's time zone. */
    public Instant instantAt(LocalDate date, LocalTime time) {
        return ZonedDateTime.of(date, time, timeZone).toInstant();
    }

    private static SinoException invalid(String message) {
        return new SinoException(PlannerErrorCode.INVALID_RECURRENCE, message);
    }

}
