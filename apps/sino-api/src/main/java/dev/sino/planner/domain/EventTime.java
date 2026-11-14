package dev.sino.planner.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;

/**
 * When an appointment happens (spec {@code calendar}): a timed span ({@link #startsAt}, {@link #endsAt}) or whole days
 * ({@link #startDate}, {@link #endDate}, the end not included), exactly one of them. The end is after the start and
 * the span is at most {@value #MAX_DAYS} days, so an occurrence that began before a range of the calendar can still be
 * found when it reaches into it.
 */
public record EventTime(Instant startsAt, Instant endsAt, LocalDate startDate, LocalDate endDate) {

    public static final int MAX_DAYS = 14;

    public EventTime {
        boolean timed = startsAt != null || endsAt != null;
        boolean wholeDays = startDate != null || endDate != null;
        if (timed == wholeDays) {
            throw new IllegalArgumentException("an appointment is timed or whole days, exactly one of them");
        }
        if (timed) {
            if (startsAt == null || endsAt == null || !endsAt.isAfter(startsAt)) {
                throw new IllegalArgumentException("a timed appointment ends after it starts");
            }
            if (Duration.between(startsAt, endsAt).compareTo(Duration.ofDays(MAX_DAYS)) > 0) {
                throw new IllegalArgumentException("an appointment lasts at most " + MAX_DAYS + " days");
            }
        } else {
            if (startDate == null || endDate == null || !endDate.isAfter(startDate)) {
                throw new IllegalArgumentException("a whole-day appointment ends after it starts");
            }
            if (ChronoUnit.DAYS.between(startDate, endDate) > MAX_DAYS) {
                throw new IllegalArgumentException("an appointment lasts at most " + MAX_DAYS + " days");
            }
        }
    }

    public static EventTime timed(Instant startsAt, Instant endsAt) {
        return new EventTime(startsAt, endsAt, null, null);
    }

    public static EventTime wholeDays(LocalDate startDate, LocalDate endDate) {
        return new EventTime(null, null, startDate, endDate);
    }

    public boolean isWholeDays() {
        return startDate != null;
    }

    /** The day the appointment starts, in {@code zone}; whole days are the same days everywhere. */
    public LocalDate startDay(ZoneId zone) {
        return startDate != null ? startDate : LocalDate.ofInstant(startsAt, zone);
    }

}
