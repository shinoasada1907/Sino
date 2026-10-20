package dev.sino.notes.application;

import java.util.Objects;

import dev.sino.notes.domain.Diagram;
import dev.sino.notes.domain.NoteKind;

/**
 * A note to create (D-179): a text note has a body and no diagram, a diagram note has a diagram and no body. Use
 * {@link #text} or {@link #diagram}; the constructor refuses a mix.
 */
public record NewNote(NoteKind kind, String title, String body, Diagram diagram) {

    public NewNote {
        Objects.requireNonNull(kind, "kind");
        switch (kind) {
            case TEXT -> {
                Objects.requireNonNull(body, "body");
                if (diagram != null) {
                    throw new IllegalArgumentException("a text note has no diagram");
                }
            }
            case DIAGRAM -> {
                Objects.requireNonNull(diagram, "diagram");
                if (body != null) {
                    throw new IllegalArgumentException("a diagram note has no body");
                }
            }
        }
    }

    public static NewNote text(String title, String body) {
        return new NewNote(NoteKind.TEXT, title, body, null);
    }

    public static NewNote diagram(String title, Diagram diagram) {
        return new NewNote(NoteKind.DIAGRAM, title, null, diagram);
    }

}
