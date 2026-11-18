package dev.sino.planner.application;

import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.Reminder;

/** A task to create: a title, and maybe notes, a due, a repeat rule (which needs the due) and a reminder (which too). */
public record NewTask(String title, String notes, Due due, RepeatRule repeat, Reminder reminder) {

    /** A task without a reminder. */
    public NewTask(String title, String notes, Due due, RepeatRule repeat) {
        this(title, notes, due, repeat, null);
    }

}
