package dev.sino.planner.application;

import dev.sino.planner.domain.EventTime;
import dev.sino.planner.domain.Reminder;

/**
 * An appointment to save, new or replacing one: a title and a time, and maybe a place, notes, a repeat rule and a
 * reminder. {@code useDefaultReminder} is for a new appointment whose request left the reminder out: it takes the
 * default of the user's settings (D-523); a replacement never does ("missing is none").
 */
public record NewEvent(String title, String location, String notes, EventTime time, RepeatRule repeat,
        Reminder reminder, boolean useDefaultReminder) {

    /** An appointment without a reminder. */
    public NewEvent(String title, String location, String notes, EventTime time, RepeatRule repeat) {
        this(title, location, notes, time, repeat, null, false);
    }

}
