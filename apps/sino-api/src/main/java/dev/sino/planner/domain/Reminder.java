package dev.sino.planner.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/**
 * The reminder of an appointment or a task (D-523): it fires {@code offsetMinutes} before the start (the due). A timed
 * start allows {@link #TIMED_OFFSETS}; a whole day has no start moment, so its start is 00:00 of that day in the zone
 * of the planner and it allows {@link #WHOLE_DAY_OFFSETS}: -540 is 9:00 that day, 900 is 9:00 the day before.
 */
public record Reminder(int offsetMinutes) {

    public static final List<Integer> TIMED_OFFSETS = List.of(0, 5, 15, 30, 60, 1440);

    public static final List<Integer> WHOLE_DAY_OFFSETS = List.of(-540, 900);

    public Reminder {
        if (!TIMED_OFFSETS.contains(offsetMinutes) && !WHOLE_DAY_OFFSETS.contains(offsetMinutes)) {
            throw new IllegalArgumentException("a reminder offset is one of " + TIMED_OFFSETS + " or "
                    + WHOLE_DAY_OFFSETS);
        }
    }

    /** Whether {@code offsetMinutes} may be used with a timed start ({@code wholeDay} false) or a whole day. */
    public static boolean isAllowed(int offsetMinutes, boolean wholeDay) {
        return (wholeDay ? WHOLE_DAY_OFFSETS : TIMED_OFFSETS).contains(offsetMinutes);
    }

    /** When the reminder fires for a timed start. */
    public Instant firesBefore(Instant start) {
        return start.minusSeconds(offsetMinutes * 60L);
    }

    /** When the reminder fires for a whole day: counted back from 00:00 of {@code day} in {@code zone}. */
    public Instant firesBefore(LocalDate day, ZoneId zone) {
        return firesBefore(day.atStartOfDay(zone).toInstant());
    }

}
