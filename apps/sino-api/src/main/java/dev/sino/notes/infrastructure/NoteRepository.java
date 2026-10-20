package dev.sino.notes.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.sino.notes.domain.Note;

public interface NoteRepository extends JpaRepository<Note, UUID> {

    Optional<Note> findByIdAndOwnerId(UUID id, UUID ownerId);

    /** Every note of a user, newest edit first; the ID (UUIDv7) orders notes edited at the same moment. */
    List<Note> findByOwnerIdOrderByUpdatedAtDescIdDesc(UUID ownerId);

}
