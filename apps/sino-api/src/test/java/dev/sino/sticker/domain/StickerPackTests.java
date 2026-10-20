package dev.sino.sticker.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class StickerPackTests {

    private static final UUID OWNER = UUID.fromString("00000000-0000-7000-8000-000000000001");
    private static final Instant NOW = Instant.parse("2026-10-20T08:00:00Z");

    @Test
    void aNewPackKeepsItsOwnerAndATrimmedName() {
        StickerPack pack = StickerPack.create(OWNER, "  Mèo vui  ", NOW);

        assertThat(pack.ownerId()).isEqualTo(OWNER);
        assertThat(pack.name()).isEqualTo("Mèo vui");
        assertThat(pack.createdAt()).isEqualTo(NOW);
    }

    @Test
    void anOwnerAndATimeAreRequired() {
        assertThatNullPointerException().isThrownBy(() -> StickerPack.create(null, "Mèo", NOW));
        assertThatNullPointerException().isThrownBy(() -> StickerPack.create(OWNER, "Mèo", null));
        assertThatNullPointerException().isThrownBy(() -> StickerPack.create(OWNER, null, NOW));
    }

    @ParameterizedTest(name = "[{index}] \"{0}\"")
    @ValueSource(strings = { "", " ", "   ", "\t", " \n ", "　" })
    void aNameHasACharacterThatIsNotWhitespace(String name) {
        assertThatIllegalArgumentException().isThrownBy(() -> StickerPack.create(OWNER, name, NOW));
    }

    @Test
    void aNameHasAtMost50CharactersCountedAsCodePointsAfterTrimming() {
        assertThat(StickerPack.create(OWNER, "x".repeat(50), NOW).name()).hasSize(50);
        assertThat(StickerPack.create(OWNER, "  " + "x".repeat(50) + "  ", NOW).name()).hasSize(50);
        assertThatIllegalArgumentException().isThrownBy(() -> StickerPack.create(OWNER, "x".repeat(51), NOW));
        // An emoji outside the basic plane is two chars in Java and one character for the column.
        String fifty = "😀".repeat(50);
        assertThat(StickerPack.create(OWNER, fifty, NOW).name()).isEqualTo(fifty);
        assertThatIllegalArgumentException().isThrownBy(() -> StickerPack.create(OWNER, fifty + "x", NOW));
    }

    @Test
    void renamingToANewNameChangesIt() {
        StickerPack pack = StickerPack.create(OWNER, "Mèo", NOW);

        assertThat(pack.rename("  Chó  ")).isTrue();
        assertThat(pack.name()).isEqualTo("Chó");
    }

    @Test
    void renamingToTheSameNameChangesNothing() {
        StickerPack pack = StickerPack.create(OWNER, "Mèo", NOW);

        assertThat(pack.rename(" Mèo ")).isFalse();
        assertThat(pack.name()).isEqualTo("Mèo");
    }

    @Test
    void aRenameThatBreaksTheRuleKeepsTheOldName() {
        StickerPack pack = StickerPack.create(OWNER, "Mèo", NOW);

        assertThatIllegalArgumentException().isThrownBy(() -> pack.rename("  "));
        assertThatIllegalArgumentException().isThrownBy(() -> pack.rename("x".repeat(51)));
        assertThat(pack.name()).isEqualTo("Mèo");
    }

    @Test
    void theKeyOfANameIgnoresCase() {
        assertThat(StickerPack.nameKey("MÈO Vui")).isEqualTo(StickerPack.nameKey("mèo vui"));
        assertThat(StickerPack.nameKey(" Mèo ")).isEqualTo(StickerPack.nameKey("mèo"));
        assertThat(StickerPack.nameKey("Mèo")).isNotEqualTo(StickerPack.nameKey("Meo"));
    }

}
