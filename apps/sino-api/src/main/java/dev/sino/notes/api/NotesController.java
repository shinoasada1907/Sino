package dev.sino.notes.api;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import dev.sino.identity.CurrentUser;
import dev.sino.notes.application.NoteService;
import dev.sino.notes.domain.Note;

/**
 * The notes of the signed-in user (F15, spec {@code notes}), text notes and diagram notes alike. The list holds every
 * note with its whole content, newest edit first; grouping, filtering and searching are the web's job (D-173).
 */
@RestController
@RequestMapping("/api/notes")
class NotesController {

    private final NoteService notes;
    private final CurrentUser currentUser;
    private final Clock clock;

    NotesController(NoteService notes, CurrentUser currentUser, Clock clock) {
        this.notes = notes;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    @GetMapping
    NotesResponse list() {
        Instant now = clock.instant();
        List<NoteResponse> items = notes.list(currentUser.requireOwnerId()).stream().map(NoteResponse::from).toList();
        return new NotesResponse(now, items);
    }

    @GetMapping("/{id}")
    NoteResponse get(@PathVariable UUID id) {
        return NoteResponse.from(notes.get(currentUser.requireOwnerId(), id));
    }

    @PostMapping
    ResponseEntity<NoteResponse> create(@Valid @RequestBody CreateNoteRequest request) {
        Note note = notes.create(currentUser.requireOwnerId(), request.toNewNote());
        URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(note.id()).toUri();
        return ResponseEntity.created(location).body(NoteResponse.from(note));
    }

    /** A change over the version the client read; an older version is a 409 and writes nothing (D-172). */
    @PatchMapping("/{id}")
    NoteResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateNoteRequest request) {
        return NoteResponse.from(notes.update(currentUser.requireOwnerId(), id, request.toChange()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        notes.delete(currentUser.requireOwnerId(), id);
    }

    record NotesResponse(Instant generatedAt, List<NoteResponse> notes) {
    }

}
