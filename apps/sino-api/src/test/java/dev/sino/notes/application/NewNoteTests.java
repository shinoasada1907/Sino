package dev.sino.notes.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.notes.domain.BlockColor;
import dev.sino.notes.domain.Diagram;
import dev.sino.notes.domain.DiagramBlock;
import dev.sino.notes.domain.NoteKind;

/** A draft names the fields of its kind and no other (D-179). */
class NewNoteTests {

    private static final Diagram DIAGRAM = new Diagram(List.of(new DiagramBlock(
            UUID.fromString("00000000-0000-7000-8000-000000000001"), 0, 0, "Một", BlockColor.DEFAULT, true)),
            List.of());

    @Test
    void aTextDraftHasABodyAndNoDiagram() {
        NewNote draft = NewNote.text("Gọi lại", "Cho phòng khám");

        assertThat(draft.kind()).isEqualTo(NoteKind.TEXT);
        assertThat(draft.title()).isEqualTo("Gọi lại");
        assertThat(draft.body()).isEqualTo("Cho phòng khám");
        assertThat(draft.diagram()).isNull();
    }

    @Test
    void aDiagramDraftHasADiagramAndNoBody() {
        NewNote draft = NewNote.diagram("Chuyến đi", DIAGRAM);

        assertThat(draft.kind()).isEqualTo(NoteKind.DIAGRAM);
        assertThat(draft.body()).isNull();
        assertThat(draft.diagram()).isEqualTo(DIAGRAM);
    }

    @Test
    void aTextDraftWithADiagramIsRefused() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new NewNote(NoteKind.TEXT, null, "Cho phòng khám", DIAGRAM));
    }

    @Test
    void aDiagramDraftWithABodyIsRefused() {
        assertThatIllegalArgumentException().isThrownBy(() -> new NewNote(NoteKind.DIAGRAM, null, "Chữ", DIAGRAM));
        assertThatIllegalArgumentException().isThrownBy(() -> new NewNote(NoteKind.DIAGRAM, null, "", DIAGRAM));
    }

    @Test
    void aDraftNeedsItsKindAndTheFieldOfItsKind() {
        assertThatNullPointerException().isThrownBy(() -> new NewNote(null, null, "Chữ", null));
        assertThatNullPointerException().isThrownBy(() -> NewNote.text("Gọi lại", null));
        assertThatNullPointerException().isThrownBy(() -> NewNote.diagram("Chuyến đi", null));
    }

}
