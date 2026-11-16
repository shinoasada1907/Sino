package dev.sino.notes.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class NoteTests {

    private static final UUID OWNER = UUID.fromString("00000000-0000-7000-8000-000000000001");
    private static final Instant NOW = Instant.parse("2026-10-02T07:05:00Z");
    private static final Instant LATER = NOW.plusSeconds(60);

    private static Note note(String title, String body) {
        return Note.createText(OWNER, title, body, NOW);
    }

    @Test
    void aNewNoteKeepsItsBodyAsTypedAndTrimsItsTitle() {
        Note note = Note.createText(OWNER, "  Mã khách hàng phòng khám  ", "  Mã KH: AD-55120.\n- Mang theo CCCD\n", NOW);

        assertThat(note.ownerId()).isEqualTo(OWNER);
        assertThat(note.title()).isEqualTo("Mã khách hàng phòng khám");
        assertThat(note.body()).isEqualTo("  Mã KH: AD-55120.\n- Mang theo CCCD\n");
        assertThat(note.pinned()).isFalse();
        assertThat(note.createdAt()).isEqualTo(NOW);
        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = { "", "   ", "\t\n" })
    void aBlankTitleIsNoTitle(String title) {
        assertThat(note(title, "Gọi lại cho phòng khám").title()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   ", "\n\t " })
    void aBodyNeedsText(String body) {
        assertThatIllegalArgumentException().isThrownBy(() -> note("Gọi lại", body));
    }

    // Spaces that Java's isBlank does not count but a browser's trim does (review BE-90): a no-break space pasted from
    // a web page, the ideographic space of a CJK keyboard, a byte order mark, figure and narrow no-break spaces.
    @ParameterizedTest
    @ValueSource(strings = { " ", "　", "﻿", "   ", " \n" })
    void aBodyOfOtherSpacesHasNoText(String body) {
        assertThat(Note.hasText(body)).isFalse();
        assertThatIllegalArgumentException().isThrownBy(() -> note("Gọi lại", body));
    }

    @Test
    void aTitleOfOtherSpacesIsNoTitleAndATitleLosesThemAtItsEnds() {
        assertThat(note(" 　﻿", "Nội dung").title()).isNull();
        assertThat(note(" Hợp đồng thuê　", "Nội dung").title()).isEqualTo("Hợp đồng thuê");
    }

    @Test
    void textIsAnyCharacterThatIsNotASpace() {
        assertThat(Note.hasText("  a ")).isTrue();
        assertThat(Note.hasText(" .")).isTrue();
        assertThat(Note.hasText(null)).isFalse();
        assertThat(Note.hasText("")).isFalse();
    }

    // PostgreSQL refuses NUL in text, which would end as a 500 for a caller that is not the REST layer (review BE-90).
    @Test
    void aNulCharacterIsRefused() {
        assertThatIllegalArgumentException().isThrownBy(() -> note(null, "Mã KH\u0000"));
        assertThatIllegalArgumentException().isThrownBy(() -> note("Mã\u0000", "Mã KH"));
        Note note = note(null, "Mã KH");
        assertThatIllegalArgumentException().isThrownBy(() -> note.edit(null, "\u0000", null, LATER));
        assertThat(note.body()).isEqualTo("Mã KH");
    }

    @Test
    void aNoteNeedsABody() {
        assertThatNullPointerException().isThrownBy(() -> note("Gọi lại", null));
    }

    @Test
    void aBodyHasAtMostTwentyThousandCharacters() {
        assertThat(note(null, "x".repeat(20_000)).body()).hasSize(20_000);
        assertThatIllegalArgumentException().isThrownBy(() -> note(null, "x".repeat(20_001)));
    }

    @Test
    void aTitleHasAtMostTwoHundredCharactersOnceTrimmed() {
        assertThat(note(" " + "x".repeat(200) + " ", "Nội dung").title()).hasSize(200);
        assertThatIllegalArgumentException().isThrownBy(() -> note("x".repeat(201), "Nội dung"));
    }

    @Test
    void anEditChangesTheTextAndTheTimeOfTheEdit() {
        Note note = note("Điều khoản 4", "Thời hạn 15 ngày");

        assertThat(note.edit("Điều khoản 4 — thời hạn thanh toán", "Thời hạn 10 ngày", null, LATER)).isTrue();

        assertThat(note.title()).isEqualTo("Điều khoản 4 — thời hạn thanh toán");
        assertThat(note.body()).isEqualTo("Thời hạn 10 ngày");
        assertThat(note.updatedAt()).isEqualTo(LATER);
        assertThat(note.createdAt()).isEqualTo(NOW);
    }

    @Test
    void anEditOfOneFieldKeepsTheOther() {
        Note note = note("Điều khoản 4", "Thời hạn 15 ngày");

        assertThat(note.edit(null, "Thời hạn 10 ngày", null, LATER)).isTrue();
        assertThat(note.title()).isEqualTo("Điều khoản 4");

        assertThat(note.edit("Hợp đồng", null, null, LATER)).isTrue();
        assertThat(note.body()).isEqualTo("Thời hạn 10 ngày");
    }

    @Test
    void anEditWithTheSameTextChangesNothing() {
        Note note = note("Điều khoản 4", "Thời hạn 15 ngày");

        assertThat(note.edit("  Điều khoản 4 ", "Thời hạn 15 ngày", null, LATER)).isFalse();
        assertThat(note.edit(null, null, null, LATER)).isFalse();

        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void anEmptyTitleRemovesTheTitle() {
        Note note = note("Điều khoản 4", "Thời hạn 15 ngày");

        assertThat(note.edit("", null, null, LATER)).isTrue();

        assertThat(note.title()).isNull();
        assertThat(note.updatedAt()).isEqualTo(LATER);
        assertThat(note.edit(" ", null, null, LATER.plusSeconds(60))).isFalse();
        assertThat(note.updatedAt()).isEqualTo(LATER);
    }

    @Test
    void aRefusedEditChangesNoField() {
        Note note = note("Điều khoản 4", "Thời hạn 15 ngày");

        assertThatIllegalArgumentException().isThrownBy(() -> note.edit("Tiêu đề mới", "  ", null, LATER));
        assertThatIllegalArgumentException().isThrownBy(() -> note.edit("x".repeat(201), "Nội dung mới", null, LATER));

        assertThat(note.title()).isEqualTo("Điều khoản 4");
        assertThat(note.body()).isEqualTo("Thời hạn 15 ngày");
        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void aPinIsNotAnEdit() {
        Note note = note(null, "Bánh bông lan trứng muối (2 hộp)");

        assertThat(note.pin(true)).isTrue();
        assertThat(note.pinned()).isTrue();
        assertThat(note.pin(true)).isFalse();
        assertThat(note.pin(false)).isTrue();
        assertThat(note.pinned()).isFalse();

        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    // ----- diagram notes (D-179) -----

    private static final UUID BLOCK_A = UUID.fromString("00000000-0000-7000-8000-00000000000a");
    private static final UUID BLOCK_B = UUID.fromString("00000000-0000-7000-8000-00000000000b");

    private static Diagram diagram(String... texts) {
        UUID[] ids = { BLOCK_A, BLOCK_B };
        List<DiagramBlock> blocks = new ArrayList<>();
        for (int i = 0; i < texts.length; i++) {
            blocks.add(new DiagramBlock(ids[i], 40.0 * i, 20, texts[i], BlockColor.DEFAULT, i == 0));
        }
        return new Diagram(blocks, List.of());
    }

    private static Note diagramNote(String title, Diagram diagram) {
        return Note.createDiagram(OWNER, title, diagram, NOW);
    }

    @Test
    void aTextNoteHasNoDiagram() {
        Note note = note(null, "Gọi lại cho phòng khám");

        assertThat(note.kind()).isEqualTo(NoteKind.TEXT);
        assertThat(note.diagram()).isNull();
    }

    @Test
    void aNewDiagramNoteKeepsItsDiagramHasNoBodyAndTrimsItsTitle() {
        Diagram diagram = diagram("Chuyến đi Đà Lạt", "Thuê homestay");

        Note note = diagramNote("  Kế hoạch chuyến đi  ", diagram);

        assertThat(note.kind()).isEqualTo(NoteKind.DIAGRAM);
        assertThat(note.title()).isEqualTo("Kế hoạch chuyến đi");
        assertThat(note.body()).isEmpty();
        assertThat(note.diagram()).isEqualTo(diagram);
        assertThat(note.ownerId()).isEqualTo(OWNER);
        assertThat(note.pinned()).isFalse();
        assertThat(note.createdAt()).isEqualTo(NOW);
        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void aDiagramNoteNeedsNoTitleAndNeedsADiagram() {
        assertThat(diagramNote(null, diagram("Một")).title()).isNull();
        assertThat(diagramNote("   ", diagram("Một")).title()).isNull();
        assertThatNullPointerException().isThrownBy(() -> diagramNote("Sơ đồ", null));
    }

    @Test
    void anEditOfTheDiagramReplacesItAndMovesTheTimeOfTheEdit() {
        Note note = diagramNote("Sơ đồ", diagram("Một"));
        Diagram bigger = diagram("Một", "Hai");

        assertThat(note.edit(null, null, bigger, LATER)).isTrue();

        assertThat(note.diagram()).isEqualTo(bigger);
        assertThat(note.updatedAt()).isEqualTo(LATER);
        assertThat(note.body()).isEmpty();
    }

    @Test
    void aDiagramWithTheSameContentChangesNothing() {
        Note note = diagramNote("Sơ đồ", diagram("Một", "Hai"));

        // Another instance with equal content: the web sends the whole diagram at every autosave.
        assertThat(note.edit(null, null, diagram("Một", "Hai"), LATER)).isFalse();

        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void theTitleOfADiagramNoteCanBeEditedAlone() {
        Note note = diagramNote("Sơ đồ", diagram("Một"));

        assertThat(note.edit("Kế hoạch", null, null, LATER)).isTrue();

        assertThat(note.title()).isEqualTo("Kế hoạch");
        assertThat(note.diagram()).isEqualTo(diagram("Một"));
        assertThat(note.updatedAt()).isEqualTo(LATER);
    }

    @Test
    void aTextNoteTakesNoDiagramAndADiagramNoteTakesNoBody() {
        Note text = note("Gọi lại", "Nội dung");
        Note diagramNote = diagramNote("Sơ đồ", diagram("Một"));

        assertThatIllegalArgumentException().isThrownBy(() -> text.edit(null, null, diagram("Một"), LATER));
        assertThatIllegalArgumentException().isThrownBy(() -> diagramNote.edit(null, "Chữ", null, LATER));

        assertThat(text.diagram()).isNull();
        assertThat(text.updatedAt()).isEqualTo(NOW);
        assertThat(diagramNote.body()).isEmpty();
        assertThat(diagramNote.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void aRefusedEditOfADiagramNoteChangesNoField() {
        Note note = diagramNote("Sơ đồ", diagram("Một"));

        assertThatIllegalArgumentException().isThrownBy(() -> note.edit("Tiêu đề mới", "Chữ", diagram("Hai"), LATER));

        assertThat(note.title()).isEqualTo("Sơ đồ");
        assertThat(note.diagram()).isEqualTo(diagram("Một"));
    }

    @Test
    void aPinOfADiagramNoteIsNotAnEdit() {
        Note note = diagramNote("Sơ đồ", diagram("Một"));

        assertThat(note.pin(true)).isTrue();

        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

}
