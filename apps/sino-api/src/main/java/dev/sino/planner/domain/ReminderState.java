package dev.sino.planner.domain;

/** Whether the reminder of an occurrence has fired already (a {@code reminder_delivery} row exists). */
public enum ReminderState {
    PENDING,
    FIRED
}
