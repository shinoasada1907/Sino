package dev.sino.notes.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import dev.sino.notes.application.NoteChange;
import dev.sino.notes.domain.Note;

/**
 * Body of {@code PATCH /api/notes/{id}}: the {@code version} the client read (D-172) and at least one of
 * {@code title}, {@code body}, {@code pinned}, {@code diagram}. A missing or {@code null} field stays as it is; an
 * empty {@code title} removes the title; {@code diagram} replaces the whole diagram. Whether {@code body} or
 * {@code diagram} suits the note is known only once the note is read: the service answers 422 if it does not.
 */
record UpdateNoteRequest(
        @NotNull @PositiveOrZero Long version,
        @Size(max = Note.MAX_TITLE_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String title,
        @Size(max = Note.MAX_BODY_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String body,
        Boolean pinned,
        @Valid @FollowsDiagramRules DiagramBody diagram) {

    @AssertTrue(message = "give at least one of title, body, pinned, diagram")
    boolean isAnyFieldGiven() {
        return title != null || body != null || pinned != null || diagram != null;
    }

    @AssertTrue(message = "body must have text")
    boolean isBodyWithTextWhenGiven() {
        return body == null || Note.hasText(body);
    }

    NoteChange toChange() {
        return new NoteChange(version, title, body, pinned, diagram == null ? null : diagram.toDiagram());
    }

}
