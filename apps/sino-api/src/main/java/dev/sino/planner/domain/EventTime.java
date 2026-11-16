package dev.sino.planner.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/**
 * When an appointment happens (spec {@code calendar}): a timed span ({@link #startsAt}, {@link #endsAt}) or whole days
 * ({@link #startDate}, {@link #endDate}, the end not included), exactly one of them. The end is after the start and
 * the span is at most {@value #MAX_DAYS} days, so an occurrence that began before a range of the calendar can still be
 * found when it reaches into it.
 */
public record EventTime(Instant startsAt, Instant endsAt, LocalDate startDate, LocalDate endDate) {

    public static final int MAX_DAYS = 14;

    /** The supported years are 1900 to 2200: a date outside them is a mistake, and far years overflow the date arithmetic. */
    public static final LocalDate EARLIEST = LocalDate.of(1900, 1, 1);

    /** The first day after the supported years; an end may be on it. */
    public static final LocalDate LATEST = LocalDate.of(2201, 1, 1);

    public static boolean isSupported(Instant moment) {
        return !moment.isBefore(EARLIEST.atStartOfDay(ZoneOffset.UTC).toInstant())
                && !moment.isAfter(LATEST.atStartOfDay(ZoneOffset.UTC).toInstant());
    }

    public static boolean isSupported(LocalDate day) {
        return !day.isBefore(EARLIEST) && !day.isAfter(LATEST);
    }

    public EventTime {
        boolean timed = startsAt != null || endsAt != null;
        boolean wholeDays = startDate != null || endDate != null;
        if (timed == wholeDays) {
            throw new IllegalArgumentException("an appointment is timed or whole days, exactly one of them");
        }
        if ((startsAt != null && !isSupported(startsAt)) || (endsAt != null && !isSupported(endsAt))
                || (startDate != null && !isSupported(startDate)) || (endDate != null && !isSupported(endDate))) {
            throw new IllegalArgumentException("an appointment is within the years 1900 to 2200");
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
