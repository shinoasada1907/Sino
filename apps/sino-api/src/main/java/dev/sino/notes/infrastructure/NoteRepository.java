package dev.sino.notes.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.sino.notes.domain.Note;

public interface NoteRepository extends JpaRepository<Note, UUID> {

    Optional<Note> findByIdAndOwnerId(UUID id, UUID ownerId);

    /** The notes of a user, the last edited first; the larger ID first when two were edited at the same time. */
    List<Note> findByOwnerIdOrderByUpdatedAtDescIdDesc(UUID ownerId);

}
