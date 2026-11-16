package dev.sino.notes.application;

import dev.sino.notes.domain.Diagram;

/**
 * A change of a note made over the version the client read (D-172). A {@code null} field stays as it is; an empty
 * title removes the title. {@code body} is for a text note and {@code diagram}, which replaces the whole diagram, for a
 * diagram note (D-179).
 */
public record NoteChange(long version, String title, String body, Boolean pinned, Diagram diagram) {

    /** A change that leaves the diagram as it is. */
    public NoteChange(long version, String title, String body, Boolean pinned) {
        this(version, title, body, pinned, null);
    }

}
