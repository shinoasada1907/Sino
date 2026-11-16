package dev.sino.notes.domain;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;

/**
 * Errors of the notes module that reach API clients (F15).
 */
public enum NotesErrorCode implements ErrorCode {

    /** No note with this ID belongs to the caller. A note of another user is reported the same way (404). */
    NOTE_NOT_FOUND(ErrorCategory.NOT_FOUND),

    /**
     * A change names a field that the kind of the note does not have: a body for a diagram note, or a diagram for a
     * text note (422). The kind is the note's own and never changes (D-179).
     */
    NOTE_KIND_MISMATCH(ErrorCategory.INVALID);

    private final ErrorCategory category;

    NotesErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

}
