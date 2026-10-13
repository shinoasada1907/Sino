package dev.sino.planner.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * When a task is due (D-81 of the web): a moment ({@link #at}) or a whole day ({@link #date}), exactly one of them.
 * "No due" is no {@code Due} at all.
 */
public record Due(Instant at, LocalDate date) {

    public Due {
        if ((at == null) == (date == null)) {
            throw new IllegalArgumentException("a due is a moment or a day, exactly one of them");
        }
    }

    public static Due at(Instant at) {
        return new Due(at, null);
    }

    public static Due on(LocalDate date) {
        return new Due(null, date);
    }

    /** The day of this due in {@code zone}; a whole day is the same day everywhere. */
    public LocalDate day(ZoneId zone) {
        return date != null ? date : LocalDate.ofInstant(at, zone);
    }

}
