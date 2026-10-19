package dev.sino.notes.domain;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;

/**
 * Errors of the notes module that reach API clients (F15).
 */
public enum NotesErrorCode implements ErrorCode {

    /** No note with this ID belongs to the caller. A note of another user is reported the same way (404). */
    NOTE_NOT_FOUND(ErrorCategory.NOT_FOUND);

    private final ErrorCategory category;

    NotesErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

}
