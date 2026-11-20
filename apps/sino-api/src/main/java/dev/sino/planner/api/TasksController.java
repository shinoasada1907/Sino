package dev.sino.planner.api;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import dev.sino.identity.CurrentUser;
import dev.sino.planner.application.CompletedTask;
import dev.sino.planner.application.ReminderViews;
import dev.sino.planner.application.TaskService;
import dev.sino.planner.domain.Task;

/**
 * The tasks of the signed-in user (F16, spec {@code tasks}). The JSON follows the web's data contract
 * ({@code fe-ui-tasks}); grouping into overdue, today and later is the web's job (D-84).
 */
@RestController
@RequestMapping("/api/tasks")
class TasksController {

    private final TaskService tasks;
    private final ReminderViews reminders;
    private final CurrentUser currentUser;
    private final Clock clock;

    TasksController(TaskService tasks, ReminderViews reminders, CurrentUser currentUser, Clock clock) {
        this.reminders = reminders;
        this.tasks = tasks;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    /** Open tasks and the tasks done in the last seven days, oldest first. */
    @GetMapping
    TasksResponse list() {
        Instant now = clock.instant();
        List<TaskResponse> items = tasks.list(currentUser.requireOwnerId()).stream().map(this::response).toList();
        return new TasksResponse(now, items);
    }

    @GetMapping("/{id}")
    TaskResponse get(@PathVariable UUID id) {
        return response(tasks.get(currentUser.requireOwnerId(), id));
    }

    @PostMapping
    ResponseEntity<TaskResponse> create(@Valid @RequestBody CreateTaskRequest request) {
        Task task = tasks.create(currentUser.requireOwnerId(), request.toNewTask());
        URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(task.id()).toUri();
        return ResponseEntity.created(location).body(response(task));
    }

    /** Renames and changes the notes; fields that are not given stay as they are. */
    @PatchMapping("/{id}")
    TaskResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateTaskRequest request) {
        return response(tasks.update(currentUser.requireOwnerId(), id, request.title(), request.notes()));
    }

    /** Replaces the due and the repeat rule together (D-153). */
    @PutMapping("/{id}/schedule")
    TaskResponse schedule(@PathVariable UUID id, @Valid @RequestBody ScheduleRequest request) {
        return response(tasks.schedule(currentUser.requireOwnerId(), id, request.due(),
                request.recurrence() == null ? null : request.recurrence().toRule(), request.reminderOrNone()));
    }

    /** Done, and the next occurrence of a repeating task; calling it again is safe. */
    @PostMapping("/{id}/complete")
    CompletedTaskResponse complete(@PathVariable UUID id) {
        CompletedTask done = tasks.complete(currentUser.requireOwnerId(), id);
        return new CompletedTaskResponse(response(done.task()),
                done.next() == null ? null : response(done.next()));
    }

    @PostMapping("/{id}/reopen")
    TaskResponse reopen(@PathVariable UUID id) {
        return response(tasks.reopen(currentUser.requireOwnerId(), id));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        tasks.delete(currentUser.requireOwnerId(), id);
    }

    private TaskResponse response(Task task) {
        return TaskResponse.from(task, reminders.of(task));
    }

    record TasksResponse(Instant generatedAt, List<TaskResponse> tasks) {
    }

    record CompletedTaskResponse(TaskResponse task, TaskResponse next) {
    }

}
