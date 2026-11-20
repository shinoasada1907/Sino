package dev.sino.planner.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import dev.sino.planner.application.ReminderViews;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.Task;
import dev.sino.planner.domain.TaskStatus;

/**
 * One task as the web's {@code TaskItem} (data contract of {@code fe-ui-tasks}). {@code reminder} is {@code null} when there is none (D-523); {@code source} and
 * {@code related} are always {@code null} for now: reminders and links to messages come later (D-150).
 */
record TaskResponse(UUID id, String title, String notes, TaskStatus status, Instant dueAt, LocalDate dueDate,
        ReminderResponse reminder, RepeatBody recurrence, UUID seriesId, Object source, Instant createdAt,
        Instant completedAt, Object related) {

    static TaskResponse from(Task task, ReminderViews.View reminder) {
        Due due = task.due();
        return new TaskResponse(task.id(), task.title(), task.notes(), task.status(), due == null ? null : due.at(),
                due == null ? null : due.date(), ReminderResponse.from(reminder), RepeatBody.from(task.recurrence()), task.seriesId(), null,
                task.createdAt(), task.completedAt(), null);
    }

}
