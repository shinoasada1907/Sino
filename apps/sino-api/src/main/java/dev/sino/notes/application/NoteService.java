package dev.sino.notes.application;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.common.error.SinoException;
import dev.sino.notes.domain.Note;
import dev.sino.notes.domain.NoteKind;
import dev.sino.notes.domain.NotesErrorCode;
import dev.sino.notes.infrastructure.NoteRepository;

/**
 * The notes of a user (spec {@code notes}, F15): list, create, edit and pin over the version read, delete. Every method
 * takes the owner from the web layer; a note of another user is reported as not found.
 */
@Service
public class NoteService {

    private final NoteRepository notes;
    private final Clock clock;

    NoteService(NoteRepository notes, Clock clock) {
        this.notes = notes;
        this.clock = clock;
    }

    /** Every note of the user with its whole body, newest edit first; the web groups, filters and searches (D-173). */
    @Transactional(readOnly = true)
    public List<Note> list(UUID ownerId) {
        return notes.findByOwnerIdOrderByUpdatedAtDescIdDesc(ownerId);
    }

    @Transactional(readOnly = true)
    public Note get(UUID ownerId, UUID id) {
        return owned(ownerId, id);
    }

    @Transactional
    public Note create(UUID ownerId, NewNote draft) {
        Note note = switch (draft.kind()) {
            case TEXT -> Note.createText(ownerId, draft.title(), draft.body(), now());
            case DIAGRAM -> Note.createDiagram(ownerId, draft.title(), draft.diagram(), now());
        };
        return notes.save(note);
    }

    /**
     * Edits and pins the note when the client read its current version (D-172), so a tab holding an older read cannot
     * write over a newer edit. Two saves of the same version at the same time are caught by the note's {@code @Version}
     * when the second one commits. A diagram replaces the whole diagram (D-179).
     *
     * @throws OptimisticLockingFailureException when the note changed since {@code change.version()}; nothing is
     *         written, and the web layer answers {@code 409 CONCURRENT_MODIFICATION}
     * @throws SinoException {@code NOTE_KIND_MISMATCH} when the change has a body for a diagram note or a diagram for
     *         a text note; this is looked at before the version, since no version makes such a change right
     */
    @Transactional
    public Note update(UUID ownerId, UUID id, NoteChange change) {
        Note note = owned(ownerId, id);
        if (change.body() != null && note.kind() != NoteKind.TEXT) {
            throw new SinoException(NotesErrorCode.NOTE_KIND_MISMATCH, "Only a text note has a body.");
        }
        if (change.diagram() != null && note.kind() != NoteKind.DIAGRAM) {
            throw new SinoException(NotesErrorCode.NOTE_KIND_MISMATCH, "Only a diagram note has a diagram.");
        }
        if (note.version() != change.version()) {
            throw new OptimisticLockingFailureException("Note " + id + " is at version " + note.version()
                    + ", the change was made over version " + change.version() + ".");
        }
        note.edit(change.title(), change.body(), change.diagram(), now());
        if (change.pinned() != null) {
            note.pin(change.pinned());
        }
        return note;
    }

    @Transactional
    public void delete(UUID ownerId, UUID id) {
        notes.delete(owned(ownerId, id));
    }

    /**
     * The clock to the microsecond, as PostgreSQL keeps it: a save answers the same times a later read gives (review
     * BE-90).
     */
    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private Note owned(UUID ownerId, UUID id) {
        return notes.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new SinoException(NotesErrorCode.NOTE_NOT_FOUND, "Note not found."));
    }

}
