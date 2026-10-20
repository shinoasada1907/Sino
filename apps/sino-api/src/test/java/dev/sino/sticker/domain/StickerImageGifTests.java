package dev.sino.sticker.domain;

import static dev.sino.sticker.domain.ImageFixtures.animatedGif;
import static dev.sino.sticker.domain.ImageFixtures.concat;
import static dev.sino.sticker.domain.ImageFixtures.gif;
import static dev.sino.sticker.domain.ImageFixtures.gifExtension;
import static dev.sino.sticker.domain.ImageFixtures.gifFrame;
import static dev.sino.sticker.domain.ImageFixtures.gifOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.common.error.SinoException;

/** Reading the type, kind and size of a GIF from its blocks (ST-03, D-332): no frame is ever decoded. */
class StickerImageGifTests {

    private static void assertRefused(byte[] content, StickerErrorCode code) {
        assertThatThrownBy(() -> StickerImage.read(content)).isInstanceOfSatisfying(SinoException.class,
                e -> assertThat(e.errorCode()).isEqualTo(code));
    }

    @Test
    void readsTheTypeAndTheSizeOfAGifTheJdkEncodes() {
        // 300 = 0x012C, written little-endian as 2C 01: a reader that takes it the other way round says 11,265.
        StickerImage image = StickerImage.read(gif(300, 200));

        assertThat(image).isEqualTo(new StickerImage(StickerMediaType.GIF, StickerKind.STATIC, 300, 200));
        assertThat(image.mediaType().value()).isEqualTo("image/gif");
    }

    @Test
    void anAnimatedGifTheJdkEncodesIsAnimated() {
        assertThat(StickerImage.read(animatedGif(64, 48, 3))).isEqualTo(new StickerImage(StickerMediaType.GIF, StickerKind.ANIMATED, 64, 48));
    }

    @Test
    void aGifOfTwoFramesIsAnimatedAndOfOneFrameIsNot() {
        assertThat(StickerImage.read(animatedGif(16, 16, 2)).kind()).isEqualTo(StickerKind.ANIMATED);
        assertThat(StickerImage.read(animatedGif(16, 16, 1)).kind()).isEqualTo(StickerKind.STATIC);
    }

    @Test
    void readsTheOlderVersionOfTheFormatToo() {
        byte[] gif = gif(20, 10);
        System.arraycopy("GIF87a".getBytes(StandardCharsets.US_ASCII), 0, gif, 0, 6);

        assertThat(StickerImage.read(gif)).isEqualTo(new StickerImage(StickerMediaType.GIF, StickerKind.STATIC, 20, 10));
    }

    @ParameterizedTest
    @ValueSource(ints = { -1, 0, 1, 2, 7 })
    void skipsAGlobalColourTableOfAnySize(int bits) {
        byte[] gif = gifOf(33, 22, bits, gifFrame(-1));

        assertThat(StickerImage.read(gif)).isEqualTo(new StickerImage(StickerMediaType.GIF, StickerKind.STATIC, 33, 22));
    }

    @ParameterizedTest
    @ValueSource(ints = { -1, 0, 3, 7 })
    void skipsALocalColourTableOfAnySizeToFindTheSecondFrame(int bits) {
        byte[] gif = gifOf(8, 8, 1, gifFrame(bits), gifFrame(-1));

        assertThat(StickerImage.read(gif).kind()).isEqualTo(StickerKind.ANIMATED);
    }

    @Test
    void skipsTheExtensionBlocksBeforeAndBetweenTheFrames() {
        byte[] control = gifExtension(0xF9, new byte[] { 0, 10, 0, 0 });
        byte[] application = gifExtension(0xFF, "NETSCAPE2.0".getBytes(StandardCharsets.US_ASCII), new byte[] { 1, 0, 0 });
        byte[] comment = gifExtension(0xFE, "made by hand".getBytes(StandardCharsets.US_ASCII), "in two parts".getBytes(StandardCharsets.US_ASCII));

        byte[] one = gifOf(10, 10, 0, application, comment, control, gifFrame(-1));
        byte[] two = gifOf(10, 10, 0, application, control, gifFrame(-1), comment, control, gifFrame(-1));

        assertThat(StickerImage.read(one).kind()).isEqualTo(StickerKind.STATIC);
        assertThat(StickerImage.read(two).kind()).isEqualTo(StickerKind.ANIMATED);
    }

    @Test
    void anExtensionOfSeveralSubBlocksIsSkippedWhole() {
        // The 0x2C inside the data of a comment is a byte of text, not the start of a frame.
        byte[] comment = gifExtension(0xFE, new byte[] { 0x2C, 0x2C, 0x2C }, new byte[] { 0x2C });

        assertThat(StickerImage.read(gifOf(5, 5, -1, comment, gifFrame(-1))).kind()).isEqualTo(StickerKind.STATIC);
    }

    @Test
    void theDataOfAFrameIsSkippedWholeToo() {
        // Frame data holding 0x2C and 0x21 bytes must not be taken for blocks.
        byte[] frame = concat(new byte[] { 0x2C, 0, 0, 0, 0, 1, 0, 1, 0, 0 }, new byte[] { 2 }, new byte[] { 4, 0x2C, 0x21, 0x2C, 0x3B }, new byte[] { 0 });

        assertThat(StickerImage.read(gifOf(1, 1, -1, frame)).kind()).isEqualTo(StickerKind.STATIC);
    }

    @Test
    void takesAGifThatEndsAfterAFrameWithoutItsTrailer() {
        byte[] withTrailer = gif(12, 12);
        byte[] without = Arrays.copyOf(withTrailer, withTrailer.length - 1);

        assertThat(withTrailer[withTrailer.length - 1]).isEqualTo((byte) 0x3B);
        assertThat(StickerImage.read(without)).isEqualTo(new StickerImage(StickerMediaType.GIF, StickerKind.STATIC, 12, 12));
    }

    @Test
    void knowsTheFileIsAnimatedAtTheSecondFrameAndDoesNotLookAtWhatFollows() {
        // The second frame is cut short; the head already says there are two.
        byte[] cut = Arrays.copyOf(gifOf(6, 6, -1, gifFrame(-1), gifFrame(-1)), 13 + gifFrame(-1).length + 4);

        assertThat(StickerImage.read(cut).kind()).isEqualTo(StickerKind.ANIMATED);
    }

    @Test
    void readsAsBigAsTheHeadSaysWithoutJudgingIt() {
        assertThat(StickerImage.read(gifOf(65_535, 65_535, -1, gifFrame(-1))))
                .isEqualTo(new StickerImage(StickerMediaType.GIF, StickerKind.STATIC, 65_535, 65_535));
    }

    @ParameterizedTest
    @ValueSource(ints = { 6, 7, 9, 10, 12 })
    void refusesAGifCutInsideItsScreenDescriptor(int length) {
        assertRefused(Arrays.copyOf(gif(20, 10), length), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAGifThatEndsRightAfterItsScreenDescriptorAndItsTables() {
        assertRefused(Arrays.copyOf(gifOf(5, 5, 2), 13 + 24), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 1 })
    void refusesAScreenOfZeroPixels(int zeroed) {
        byte[] gif = gifOf(5, 5, -1, gifFrame(-1));
        gif[6 + 2 * zeroed] = 0;
        gif[7 + 2 * zeroed] = 0;

        assertRefused(gif, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAGifWithoutAnyFrame() {
        assertRefused(gifOf(5, 5, 1), StickerErrorCode.STICKER_INVALID_IMAGE);
        assertRefused(gifOf(5, 5, -1, gifExtension(0xFE, new byte[] { 'x' })), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesABlockThatIsNeitherAnExtensionNorAFrameNorTheEnd() {
        assertRefused(gifOf(5, 5, -1, new byte[] { (byte) 0x99, 0, 0 }, gifFrame(-1)), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(ints = { 1, 5, 9, 10, 11, 14 })
    void refusesAFirstFrameCutAnywhere(int keptOfTheFrame) {
        byte[] frame = gifFrame(-1);
        byte[] cut = concat(Arrays.copyOf(gifOf(5, 5, -1), 13), Arrays.copyOf(frame, keptOfTheFrame));

        assertRefused(cut, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAFrameWhoseDataClaimsAFewBytesMoreThanTheFileHas() {
        // 10 bytes claimed, 2 there: without the check the file would be taken for a whole, still, GIF.
        byte[] frame = concat(new byte[] { 0x2C, 0, 0, 0, 0, 1, 0, 1, 0, 0 }, new byte[] { 2 }, new byte[] { 10, 1, 2 });

        assertRefused(concat(Arrays.copyOf(gifOf(5, 5, -1), 13), frame), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAnExtensionCutBeforeItsLabelOrItsEnd() {
        byte[] head = Arrays.copyOf(gifOf(5, 5, -1), 13);

        assertRefused(concat(head, new byte[] { 0x21 }), StickerErrorCode.STICKER_INVALID_IMAGE);
        assertRefused(concat(head, new byte[] { 0x21, (byte) 0xFE, 3, 'a' }), StickerErrorCode.STICKER_INVALID_IMAGE);
        assertRefused(concat(head, new byte[] { 0x21, (byte) 0xFE, 3, 'a', 'b', 'c' }), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    @Timeout(value = 5, threadMode = Timeout.ThreadMode.SEPARATE_THREAD)
    void aSubBlockThatClaimsMoreBytesThanThereAreIsRefusedAndNeverReadPastTheEnd() {
        byte[] head = Arrays.copyOf(gifOf(5, 5, -1), 13);

        assertRefused(concat(head, new byte[] { 0x21, (byte) 0xFE, (byte) 0xFF, 1, 2, 3 }), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAnotherVersionOfTheFormatAndAShortSignature() {
        byte[] other = gif(20, 10);
        System.arraycopy("GIF90a".getBytes(StandardCharsets.US_ASCII), 0, other, 0, 6);

        assertRefused(other, StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
        assertRefused("GIF89".getBytes(StandardCharsets.US_ASCII), StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

}
