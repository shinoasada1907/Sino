package dev.sino.planner.api;

import java.time.Instant;

import dev.sino.planner.application.ReminderViews;
import dev.sino.planner.domain.ReminderState;

/**
 * The reminder of an appointment or a task as read (D-523): {@code at} is when the reminder of the next occurrence
 * fires, {@code offsetMinutes} is what was asked, {@code state} is {@code FIRED} once that one has fired.
 */
record ReminderResponse(Instant at, int offsetMinutes, ReminderState state) {

    /** {@code null} when there is no reminder. */
    static ReminderResponse from(ReminderViews.View view) {
        return view == null ? null : new ReminderResponse(view.at(), view.offsetMinutes(), view.state());
    }

}
