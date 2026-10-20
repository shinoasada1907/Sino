package dev.sino.notes.domain;

/**
 * What a note holds (D-179): {@code TEXT} a body typed by the user, {@code DIAGRAM} blocks joined by arrows. The kind
 * is chosen when the note is created and never changes.
 */
public enum NoteKind {

    TEXT,

    DIAGRAM

}
