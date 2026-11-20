package dev.sino.planner.application.reminder;

/**
 * What happens when a reminder comes due (D-524 steps 2 to 4): the record for the bell, the push over SSE and the
 * email. The job calls it once and books the next occurrence after it returns; when it throws, JobRunr tries the job
 * again, so an implementation must be safe to call twice for the same {@link ReminderDue}.
 */
public interface ReminderFiring {

    void fire(ReminderDue due);

}
