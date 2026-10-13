package dev.sino.planner.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.common.error.SinoException;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.PlannerErrorCode;
import dev.sino.planner.domain.Recurrence;
import dev.sino.planner.domain.Task;
import dev.sino.planner.infrastructure.TaskRepository;

/**
 * The tasks of a user (spec {@code tasks}, F16): list, create, rename and notes, due and repeat rule, done and open
 * again, delete. Every method takes the owner from the web layer; a task of another user is reported as not found.
 */
@Service
public class TaskService {

    /** How long a done task stays in the list (the web's "Đã xong" group). */
    static final Duration DONE_KEPT_FOR = Duration.ofDays(7);

    private final TaskRepository tasks;
    private final PlannerProperties properties;
    private final Clock clock;

    TaskService(TaskRepository tasks, PlannerProperties properties, Clock clock) {
        this.tasks = tasks;
        this.properties = properties;
        this.clock = clock;
    }

    /** The open tasks and the tasks done in the last seven days, oldest first; the web groups them (D-84). */
    @Transactional(readOnly = true)
    public List<Task> list(UUID ownerId) {
        return tasks.findCurrent(ownerId, clock.instant().minus(DONE_KEPT_FOR));
    }

    @Transactional(readOnly = true)
    public Task get(UUID ownerId, UUID id) {
        return owned(ownerId, id);
    }

    /**
     * @throws SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not fit the due
     */
    @Transactional
    public Task create(UUID ownerId, NewTask draft) {
        Recurrence rule = ruleOf(draft.repeat());
        return tasks.save(Task.create(ownerId, draft.title(), draft.notes(), draft.due(), rule, clock.instant()));
    }

    /** Renames and changes the notes; a {@code null} argument leaves that field as it is. */
    @Transactional
    public Task update(UUID ownerId, UUID id, String title, String notes) {
        Task task = owned(ownerId, id);
        Instant now = clock.instant();
        if (title != null) {
            task.rename(title, now);
        }
        if (notes != null) {
            task.changeNotes(notes, now);
        }
        return task;
    }

    /**
     * Replaces the due and the repeat rule together; {@code null} is none (D-153).
     *
     * @throws SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not fit the due
     */
    @Transactional
    public Task schedule(UUID ownerId, UUID id, Due due, RepeatRule repeat) {
        Task task = owned(ownerId, id);
        task.reschedule(due, ruleOf(repeat), clock.instant());
        return task;
    }

    /**
     * Marks the task done and, when it repeats, stores its next occurrence in the same transaction, so a task is never
     * done without its next one. A task that is already done stays as it is and makes nothing: calling again is safe.
     * A task makes its next occurrence once, even when it is opened again and done again (D-159).
     */
    @Transactional
    public CompletedTask complete(UUID ownerId, UUID id) {
        Task task = owned(ownerId, id);
        Instant now = clock.instant();
        if (!task.complete(now)) {
            return new CompletedTask(task, null);
        }
        Task next = task.makeNextOccurrence(now).map(tasks::save).orElse(null);
        return new CompletedTask(task, next);
    }

    /** Opens a done task again; a next occurrence already made stays (D-154). */
    @Transactional
    public Task reopen(UUID ownerId, UUID id) {
        Task task = owned(ownerId, id);
        task.reopen(clock.instant());
        return task;
    }

    /** Deletes this task only; the other occurrences of its series stay. */
    @Transactional
    public void delete(UUID ownerId, UUID id) {
        tasks.delete(owned(ownerId, id));
    }

    private Task owned(UUID ownerId, UUID id) {
        return tasks.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new SinoException(PlannerErrorCode.TASK_NOT_FOUND, "Task not found."));
    }

    /** The client's rule in Sino's time zone (D-157); the task checks it against its due. */
    private Recurrence ruleOf(RepeatRule repeat) {
        return repeat == null ? null : repeat.in(properties.timeZone());
    }

}
