package dev.sino.planner.application;

import dev.sino.planner.domain.Due;

/** A task to create: a title, and maybe notes, a due and a repeat rule (which needs the due). */
public record NewTask(String title, String notes, Due due, RepeatRule repeat) {
}
