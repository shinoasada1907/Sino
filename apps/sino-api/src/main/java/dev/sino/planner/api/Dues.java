package dev.sino.planner.api;

import java.time.Instant;
import java.time.LocalDate;

import tools.jackson.databind.JsonNode;

import dev.sino.planner.domain.Due;

/** The two due fields of a request body ({@code dueAt}, {@code dueDate}) as one {@link Due}. */
final class Dues {

    private Dues() {
    }

    static boolean oneAtMost(Instant at, LocalDate date) {
        return at == null || date == null;
    }

    /** Whether the reminder, if any, is allowed for this due: it needs a due, and its offset must fit the kind of due. */
    static boolean reminderAllowed(Instant at, LocalDate date, JsonNode reminder) {
        boolean none = reminder == null || reminder.isNull();
        return none || (at != null || date != null) && ReminderBody.isAllowed(reminder, date != null);
    }

    /** {@code null} when neither is given; call only once {@link #oneAtMost} holds. */
    static Due of(Instant at, LocalDate date) {
        if (at != null) {
            return Due.at(at);
        }
        return date == null ? null : Due.on(date);
    }

}
