package dev.sino.planner.application;

import dev.sino.planner.domain.Task;

/**
 * A task just marked done, and the next occurrence made for it when it repeats; {@code next} is {@code null} when it
 * does not repeat, the rule has ended, or the task was already done.
 */
public record CompletedTask(Task task, Task next) {
}
