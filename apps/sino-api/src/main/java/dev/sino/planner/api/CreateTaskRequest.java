package dev.sino.planner.api;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import tools.jackson.databind.JsonNode;

import dev.sino.planner.application.NewTask;
import dev.sino.planner.domain.Task;

/**
 * Body of {@code POST /api/tasks}: a title, and maybe notes, a due ({@code dueAt} or {@code dueDate}) and a repeat
 * rule, which needs the due.
 */
record CreateTaskRequest(
        @NotBlank @Size(max = Task.MAX_TITLE_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String title,
        @Size(max = Task.MAX_NOTES_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String notes,
        Instant dueAt,
        LocalDate dueDate,
        @Valid RepeatBody recurrence,
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

    NewTask toNewTask() {
        return new NewTask(title, notes, Dues.of(dueAt, dueDate), recurrence == null ? null : recurrence.toRule(),
                ReminderBody.reminderOf(reminder));
    }

}
