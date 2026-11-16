package dev.sino.notes.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import dev.sino.notes.domain.Note;
import dev.sino.notes.domain.NoteKind;

/**
 * One note as the web's {@code NoteItem} (data contracts of {@code fe-ui-notes} and {@code fe-ui-diagram-notes}) plus
 * its {@code version}. {@code body} is empty for a diagram note and {@code diagram} is {@code null} for a text note.
 * {@code anchor}, {@code quote} and {@code linked} are always {@code null}, {@code null} and empty for now: notes are
 * not tied to messages yet (D-177).
 */
record NoteResponse(UUID id, NoteKind kind, String title, String body, DiagramBody diagram, boolean pinned,
        Instant createdAt, Instant updatedAt, long version, Object anchor, Object quote, List<Object> linked) {

    static NoteResponse from(Note note) {
        return new NoteResponse(note.id(), note.kind(), note.title(), note.body(),
                note.diagram() == null ? null : DiagramBody.from(note.diagram()), note.pinned(), note.createdAt(),
                note.updatedAt(), note.version(), null, null, List.of());
    }

}
