package dev.sino.notes.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import dev.sino.notes.application.NewNote;
import dev.sino.notes.domain.Note;
import dev.sino.notes.domain.NoteKind;

/**
 * Body of {@code POST /api/notes}: a text note ({@code kind} left out or {@code TEXT}) has a body with text and no
 * diagram; a diagram note ({@code DIAGRAM}) has a diagram and no body. The title is optional in both (D-174, D-179).
 */
record CreateNoteRequest(
        NoteKind kind,
        @Size(max = Note.MAX_TITLE_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String title,
        @Size(max = Note.MAX_BODY_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String body,
        @Valid @FollowsDiagramRules DiagramBody diagram) {

    private NoteKind kindOrText() {
        return kind == null ? NoteKind.TEXT : kind;
    }

    @AssertTrue(message = "a text note needs a body with text and has no diagram")
    boolean isTextNoteWellFormed() {
        return kindOrText() != NoteKind.TEXT || (Note.hasText(body) && diagram == null);
    }

    @AssertTrue(message = "a diagram note needs a diagram and has no body")
    boolean isDiagramNoteWellFormed() {
        return kindOrText() != NoteKind.DIAGRAM || (diagram != null && body == null);
    }

    NewNote toNewNote() {
        return switch (kindOrText()) {
            case TEXT -> NewNote.text(title, body);
            case DIAGRAM -> NewNote.diagram(title, diagram.toDiagram());
        };
    }

}
