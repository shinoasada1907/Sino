package dev.sino.notes.application;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.common.error.SinoException;
import dev.sino.notes.domain.Note;
import dev.sino.notes.domain.NotesErrorCode;
import dev.sino.notes.infrastructure.NoteRepository;

/**
 * The notes of a user (spec {@code notes}, F15): list, create, change with a version check, delete. Every method
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

    /** All notes of the user, the last edited first (D-173). */
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
        return notes.save(Note.create(ownerId, draft.title(), draft.body(), clock.instant()));
    }

    /**
     * Changes a note the client read at {@code version} (D-172). A field left {@code null} stays as it is. A change
     * that leaves every value as it was writes nothing and keeps the version. The note returned carries its new
     * version: Hibernate raises it on this same object when the transaction commits, before the caller gets it.
     *
     * @throws org.springframework.dao.OptimisticLockingFailureException when the note is no longer at {@code version},
     *         or when another request changes it at the same time; nothing is written then
     */
    @Transactional
    public Note update(UUID ownerId, UUID id, long version, NoteChange change) {
        Note note = owned(ownerId, id);
        if (note.version() != version) {
            throw new ObjectOptimisticLockingFailureException(Note.class, id);
        }
        if (change.title() != null || change.body() != null) {
            note.edit(change.title() != null ? change.title() : note.title(),
                    change.body() != null ? change.body() : note.body(), clock.instant());
        }
        if (change.pinned() != null) {
            note.pin(change.pinned());
        }
        return note;
    }

    /** Deletes the note for good; it needs no version (D-176). */
    @Transactional
    public void delete(UUID ownerId, UUID id) {
        notes.delete(owned(ownerId, id));
    }

    private Note owned(UUID ownerId, UUID id) {
        return notes.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new SinoException(NotesErrorCode.NOTE_NOT_FOUND, "Note not found."));
    }

}
