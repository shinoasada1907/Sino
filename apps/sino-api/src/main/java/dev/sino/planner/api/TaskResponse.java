package dev.sino.planner.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.Task;
import dev.sino.planner.domain.TaskStatus;

/**
 * One task as the web's {@code TaskItem} (data contract of {@code fe-ui-tasks}). {@code reminder}, {@code source} and
 * {@code related} are always {@code null} for now: reminders and links to messages come later (D-150).
 */
record TaskResponse(UUID id, String title, String notes, TaskStatus status, Instant dueAt, LocalDate dueDate,
        Object reminder, RepeatBody recurrence, UUID seriesId, Object source, Instant createdAt,
        Instant completedAt, Object related) {

    static TaskResponse from(Task task) {
        Due due = task.due();
        return new TaskResponse(task.id(), task.title(), task.notes(), task.status(), due == null ? null : due.at(),
                due == null ? null : due.date(), null, RepeatBody.from(task.recurrence()), task.seriesId(), null,
                task.createdAt(), task.completedAt(), null);
    }

}
