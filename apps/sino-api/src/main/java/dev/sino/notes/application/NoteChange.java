package dev.sino.notes.application;

/**
 * What a client changes in a note. A {@code null} field stays as it is; a {@code title} of empty text takes the
 * title away.
 */
public record NoteChange(String title, String body, Boolean pinned) {
}
