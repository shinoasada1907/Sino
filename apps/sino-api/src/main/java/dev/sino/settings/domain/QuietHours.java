package dev.sino.settings.domain;

import java.time.LocalTime;
import java.util.Objects;

/**
 * When notifications keep quiet: from {@code start} to {@code end}, in whole minutes. The two differ, and the span may
 * run past midnight (22:00 to 07:00).
 */
public record QuietHours(LocalTime start, LocalTime end) {

    public QuietHours {
        requireWholeMinute(start, "start");
        requireWholeMinute(end, "end");
        if (start.equals(end)) {
            throw new IllegalArgumentException("Quiet hours must start and end at different times");
        }
    }

    static void requireWholeMinute(LocalTime time, String name) {
        Objects.requireNonNull(time, name);
        if (time.getSecond() != 0 || time.getNano() != 0) {
            throw new IllegalArgumentException(name + " must be a whole minute");
        }
    }

}
