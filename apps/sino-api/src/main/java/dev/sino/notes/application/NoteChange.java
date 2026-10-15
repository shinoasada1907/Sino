package dev.sino.notes.application;

/**
 * A change of a note made over the version the client read (D-172). A {@code null} field stays as it is; an empty
 * title removes the title.
 */
public record NoteChange(long version, String title, String body, Boolean pinned) {
}
