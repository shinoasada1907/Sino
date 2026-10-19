package dev.sino.notes.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class NoteTests {

    private static final UUID OWNER = UUID.fromString("00000000-0000-7000-8000-000000000001");
    private static final Instant NOW = Instant.parse("2026-10-02T07:05:00Z");
    private static final Instant LATER = NOW.plusSeconds(3600);

    private static Note note(String title, String body) {
        return Note.create(OWNER, title, body, NOW);
    }

    @Test
    void aNewNoteIsNotPinnedAndKeepsItsBodyAsTyped() {
        Note note = note("Phòng khám", "  Gọi lại cho phòng khám\n\n  Mang theo CCCD  \n");

        assertThat(note.ownerId()).isEqualTo(OWNER);
        assertThat(note.title()).isEqualTo("Phòng khám");
        assertThat(note.body()).isEqualTo("  Gọi lại cho phòng khám\n\n  Mang theo CCCD  \n");
        assertThat(note.pinned()).isFalse();
        assertThat(note.createdAt()).isEqualTo(NOW);
        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void anOwnerIsRequired() {
        assertThatNullPointerException().isThrownBy(() -> Note.create(null, "A", "B", NOW));
    }

    @ParameterizedTest(name = "[{index}] title \"{0}\"")
    @NullAndEmptySource
    @ValueSource(strings = { " ", "   ", "\t", " \n ", "　" })
    void aBlankTitleIsNoTitle(String title) {
        assertThat(note(title, "Mang theo CCCD").title()).isNull();
    }

    @Test
    void aTitleLosesTheWhitespaceAtBothEnds() {
        assertThat(note("  Gọi lại  ", "x").title()).isEqualTo("Gọi lại");
    }

    @Test
    void aTitleHasAtMost200CharactersAfterTrimming() {
        assertThat(note("x".repeat(200), "x").title()).hasSize(200);
        assertThat(note("  " + "x".repeat(200) + "  ", "x").title()).hasSize(200);
        assertThatIllegalArgumentException().isThrownBy(() -> note("x".repeat(201), "x"));
    }

    @ParameterizedTest(name = "[{index}] body \"{0}\"")
    @NullAndEmptySource
    @ValueSource(strings = { " ", "   ", "\n", " \n\t ", "　" })
    void aBodyNeedsAtLeastOneCharacterThatIsNotWhitespace(String body) {
        assertThatIllegalArgumentException().isThrownBy(() -> note("Gọi lại", body));
    }

    @Test
    void aBodyHasAtMost20000Characters() {
        assertThat(note(null, "x".repeat(20_000)).body()).hasSize(20_000);
        assertThatIllegalArgumentException().isThrownBy(() -> note(null, "x".repeat(20_001)));
    }

    @Test
    void editingToANewBodyOrTitleChangesTheTimeItWasEdited() {
        Note note = note("Phòng khám", "Gọi lại");

        assertThat(note.edit("Phòng khám", "Gọi lại sau 5 giờ", LATER)).isTrue();
        assertThat(note.body()).isEqualTo("Gọi lại sau 5 giờ");
        assertThat(note.updatedAt()).isEqualTo(LATER);
        assertThat(note.createdAt()).isEqualTo(NOW);

        assertThat(note.edit("Bác sĩ", "Gọi lại sau 5 giờ", LATER.plusSeconds(60))).isTrue();
        assertThat(note.title()).isEqualTo("Bác sĩ");
        assertThat(note.updatedAt()).isEqualTo(LATER.plusSeconds(60));
    }

    @Test
    void editingToTheSameValuesChangesNothing() {
        Note note = note("Phòng khám", "Gọi lại");

        assertThat(note.edit("Phòng khám", "Gọi lại", LATER)).isFalse();
        // A title is compared after the same trimming a new note gets.
        assertThat(note.edit("  Phòng khám ", "Gọi lại", LATER)).isFalse();
        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @ParameterizedTest(name = "[{index}] title \"{0}\"")
    @NullAndEmptySource
    @ValueSource(strings = { "  ", "\t" })
    void editingToABlankTitleTakesTheTitleAway(String blank) {
        Note note = note("Phòng khám", "Gọi lại");

        assertThat(note.edit(blank, "Gọi lại", LATER)).isTrue();
        assertThat(note.title()).isNull();
        assertThat(note.updatedAt()).isEqualTo(LATER);
    }

    @Test
    void editingANoteWithoutATitleToNoTitleChangesNothing() {
        Note note = note(null, "Gọi lại");

        assertThat(note.edit("  ", "Gọi lại", LATER)).isFalse();
        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void anEditThatBreaksARuleChangesNothing() {
        Note note = note("Phòng khám", "Gọi lại");

        assertThatIllegalArgumentException().isThrownBy(() -> note.edit("Bác sĩ", "   ", LATER));
        assertThatIllegalArgumentException().isThrownBy(() -> note.edit("Bác sĩ", "x".repeat(20_001), LATER));
        assertThatIllegalArgumentException().isThrownBy(() -> note.edit("x".repeat(201), "Gọi lại", LATER));

        assertThat(note.title()).isEqualTo("Phòng khám");
        assertThat(note.body()).isEqualTo("Gọi lại");
        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

    @Test
    void pinningIsNotAnEdit() {
        Note note = note("Phòng khám", "Gọi lại");

        assertThat(note.pin(true)).isTrue();
        assertThat(note.pinned()).isTrue();
        assertThat(note.updatedAt()).isEqualTo(NOW);

        assertThat(note.pin(true)).isFalse();
        assertThat(note.pin(false)).isTrue();
        assertThat(note.pinned()).isFalse();
        assertThat(note.pin(false)).isFalse();
        assertThat(note.updatedAt()).isEqualTo(NOW);
    }

}
