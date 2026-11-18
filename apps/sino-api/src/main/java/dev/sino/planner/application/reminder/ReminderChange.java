package dev.sino.planner.application.reminder;

import java.util.UUID;

import dev.sino.planner.domain.ReminderKind;

/**
 * Published inside the transaction that creates, changes, completes, reopens or deletes an appointment or a task: its
 * reminder job may be wrong now. {@link ReminderScheduler} books it again once the transaction has committed (D-522).
 *
 * @param rev the revision of the job the row had when the change was made, so a deleted row can still have its job
 *        cancelled
 */
public record ReminderChange(ReminderKind kind, UUID id, int rev) {
}
