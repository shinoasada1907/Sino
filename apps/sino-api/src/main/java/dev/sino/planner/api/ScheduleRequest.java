package dev.sino.planner.api;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;

import dev.sino.planner.domain.Due;

/**
 * Body of {@code PUT /api/tasks/{id}/schedule}: the due and the repeat rule together, replacing both; a missing or
 * {@code null} field is "none" (D-153), so {@code {}} removes the due and the rule.
 */
record ScheduleRequest(Instant dueAt, LocalDate dueDate, @Valid RepeatBody recurrence) {

    @AssertTrue(message = "give dueAt or dueDate, not both")
    boolean isOneDueAtMost() {
        return Dues.oneAtMost(dueAt, dueDate);
    }

    @AssertTrue(message = "only a task with a due repeats")
    boolean isRepeatingWithADue() {
        return recurrence == null || dueAt != null || dueDate != null;
    }

    Due due() {
        return Dues.of(dueAt, dueDate);
    }

}
