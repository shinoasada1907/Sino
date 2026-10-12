package dev.sino.planner.domain;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;

/**
 * Errors of the planner module that reach API clients (F16 + F17).
 */
public enum PlannerErrorCode implements ErrorCode {

    /** A repeat rule does not fit its first date, which only the user's time zone tells (422). */
    INVALID_RECURRENCE(ErrorCategory.INVALID),

    /** No task with this ID belongs to the caller. A task of another user is reported the same way (404). */
    TASK_NOT_FOUND(ErrorCategory.NOT_FOUND);

    private final ErrorCategory category;

    PlannerErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

}
