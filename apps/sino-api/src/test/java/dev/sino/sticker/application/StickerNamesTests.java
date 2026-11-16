package dev.sino.sticker.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

/** How a sticker is named (D-334): the name asked for, else the name of the file without its extension, else "Sticker". */
class StickerNamesTests {

    @Test
    void takesTheNameAskedForWithoutTheSpacesAroundIt() {
        assertThat(StickerNames.of("  Mèo vui  ", "meo.png")).isEqualTo("Mèo vui");
    }

    @Test
    void theNameAskedForWinsOverTheFileName() {
        assertThat(StickerNames.of("nhảy", "dance.gif")).isEqualTo("nhảy");
    }

    @ParameterizedTest
    @CsvSource({ "meo.png,meo", "nhay.GIF,nhay", "a.b.c.webp,a.b.c", "no extension,no extension", "'  spaced.png  ',spaced",
            "Mèo vui.png,Mèo vui", "a.,a" })
    void withoutANameTakesTheFileNameWithoutItsLastExtension(String fileName, String expected) {
        assertThat(StickerNames.of(null, fileName)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", " ", "   ", "\t\n" })
    void aBlankNameAskedForIsNoName(String asked) {
        assertThat(StickerNames.of(asked, "dance.gif")).isEqualTo("dance");
    }

    @ParameterizedTest
    @CsvSource({ "C:\\fakepath\\meo.png,meo", "/home/an/Pictures/meo.png,meo", "a/b\\c/d.png,d", "dir/,Sticker", "C:\\x\\,Sticker" })
    void keepsOnlyTheLastPartOfAPath(String fileName, String expected) {
        // Browsers send the name alone; some older ones sent the whole path.
        assertThat(StickerNames.of(null, fileName)).isEqualTo(expected);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = { "", " ", ".png", ".gitignore", "..", "." })
    void withNothingToTakeTheNameIsSticker(String fileName) {
        assertThat(StickerNames.of(null, fileName)).isEqualTo("Sticker");
        assertThat(StickerNames.of("  ", fileName)).isEqualTo("Sticker");
    }

    @Test
    void cutsALongNameToFiftyCodePointsAndNotInTheMiddleOfAnEmoji() {
        assertThat(StickerNames.of("x".repeat(80), null)).isEqualTo("x".repeat(50));
        // 51 emoji of two UTF-16 units each: cut at 50 emoji, not at 50 units (which would be 25 emoji) or half an emoji.
        assertThat(StickerNames.of("😀".repeat(51), null)).isEqualTo("😀".repeat(50));
        assertThat(StickerNames.of(null, "😀".repeat(51) + ".png")).isEqualTo("😀".repeat(50));
    }

    @Test
    void keepsAWholeNameOfThirtyEmojiThatIsLongerThanFiftyInUtf16Units() {
        // 30 emoji are 30 code points and 60 UTF-16 units: under the limit, so nothing is cut (and nothing fails).
        assertThat(StickerNames.of("😀".repeat(30), null)).isEqualTo("😀".repeat(30));
        assertThat(StickerNames.of(null, "😀".repeat(30) + ".png")).isEqualTo("😀".repeat(30));
    }

    @Test
    void keepsAWholeNameOfExactlyFiftyCodePoints() {
        assertThat(StickerNames.of("y".repeat(50), null)).isEqualTo("y".repeat(50));
        assertThat(StickerNames.of("😀".repeat(50), null)).isEqualTo("😀".repeat(50));
    }

    @Test
    void trimsAgainAfterTheCutSoTheNameDoesNotEndInASpace() {
        String asked = "a".repeat(49) + "   b";

        assertThat(StickerNames.of(asked, null)).isEqualTo("a".repeat(49));
    }

    @Test
    void dropsControlCharactersThatAFileNameCouldCarry() {
        assertThat(StickerNames.of(null, "me\u0000o\n.png")).isEqualTo("meo");
        assertThat(StickerNames.of("a\tb\u0007c", null)).isEqualTo("abc");
    }

    @Test
    void aNameOfOnlyControlCharactersIsNoName() {
        assertThat(StickerNames.of("\u0000\u0001", "\u0002.png")).isEqualTo("Sticker");
    }

    @Test
    void aFileNameThatIsOnlyAnExtensionOfAnotherKindIsStillNamedSticker() {
        assertThat(StickerNames.of(null, "  .png")).isEqualTo("Sticker");
    }

}
