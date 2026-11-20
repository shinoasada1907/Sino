package dev.sino.planner.api;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;

import tools.jackson.databind.JsonNode;

import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.Reminder;

/**
 * Body of {@code PUT /api/tasks/{id}/schedule}: the due, the repeat rule and the reminder together, replacing all; a
 * missing or {@code null} field is "none" (D-153), so {@code {}} removes the due, the rule and the reminder.
 */
record ScheduleRequest(Instant dueAt, LocalDate dueDate, @Valid RepeatBody recurrence,
        JsonNode reminder) {

    @AssertTrue(message = "give dueAt or dueDate, not both")
    boolean isOneDueAtMost() {
        return Dues.oneAtMost(dueAt, dueDate);
    }

    @AssertTrue(message = "only a task with a due repeats")
    boolean isRepeatingWithADue() {
        return recurrence == null || dueAt != null || dueDate != null;
    }

    @AssertTrue(message = "a reminder needs a due and fits it: 0, 5, 15, 30, 60, 1440 or -540, 900 for a day")
    boolean isReminderAllowed() {
        return Dues.reminderAllowed(dueAt, dueDate, reminder);
    }

    /** The reminder to keep; a missing one is none (D-153). */
    Reminder reminderOrNone() {
        return ReminderBody.reminderOf(reminder);
    }

    Due due() {
        return Dues.of(dueAt, dueDate);
    }

}
