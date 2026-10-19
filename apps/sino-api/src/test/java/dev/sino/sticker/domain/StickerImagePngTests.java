package dev.sino.sticker.domain;

import static dev.sino.sticker.domain.ImageFixtures.PNG_AFTER_IHDR;
import static dev.sino.sticker.domain.ImageFixtures.concat;
import static dev.sino.sticker.domain.ImageFixtures.png;
import static dev.sino.sticker.domain.ImageFixtures.pngChunk;
import static dev.sino.sticker.domain.ImageFixtures.pngSaying;
import static dev.sino.sticker.domain.ImageFixtures.pngWithChunkAfterIhdr;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.common.error.SinoException;

/** Reading the type, kind and size of a PNG from its head (ST-02, D-332): no pixel is ever decoded. */
class StickerImagePngTests {

    private static final byte[] APNG_CONTROL = { 0, 0, 0, 2, 0, 0, 0, 0 };

    private static void assertRefused(byte[] content, StickerErrorCode code) {
        assertThatThrownBy(() -> StickerImage.read(content)).isInstanceOfSatisfying(SinoException.class,
                e -> assertThat(e.errorCode()).isEqualTo(code));
    }

    @Test
    void readsTheTypeAndTheSizeOfAPngTheJdkEncodes() {
        StickerImage image = StickerImage.read(png(256, 128));

        assertThat(image).isEqualTo(new StickerImage(StickerMediaType.PNG, StickerKind.STATIC, 256, 128));
        assertThat(image.mediaType().value()).isEqualTo("image/png");
    }

    @Test
    void readsTheSmallestPng() {
        assertThat(StickerImage.read(png(1, 1))).isEqualTo(new StickerImage(StickerMediaType.PNG, StickerKind.STATIC, 1, 1));
    }

    @Test
    void aPngWithAnAnimationControlChunkBeforeItsImageDataIsAnimated() {
        byte[] apng = pngWithChunkAfterIhdr(png(64, 64), "acTL", APNG_CONTROL);

        assertThat(StickerImage.read(apng).kind()).isEqualTo(StickerKind.ANIMATED);
    }

    @Test
    void anAnimationControlChunkAfterTheImageDataDoesNotMakeAPngAnimated() {
        byte[] png = png(64, 64);
        byte[] late = concat(png, pngChunk("acTL", APNG_CONTROL));

        assertThat(StickerImage.read(late).kind()).isEqualTo(StickerKind.STATIC);
    }

    @Test
    void skipsTheChunksBeforeTheImageDataWhateverTheirNumber() {
        byte[] png = png(40, 30);
        for (int i = 0; i < 5; i++) {
            png = pngWithChunkAfterIhdr(png, "tEXt", "Comment\0hello".getBytes(StandardCharsets.US_ASCII));
        }

        assertThat(StickerImage.read(png)).isEqualTo(new StickerImage(StickerMediaType.PNG, StickerKind.STATIC, 40, 30));
    }

    @Test
    void readsAsWideAsTheHeadSaysWithoutJudgingIt() {
        // Whether 60,000 px is too much is for the service (the limit moves with the configuration); the reader only reads.
        assertThat(StickerImage.read(pngSaying(png(8, 8), 60_000, 40_000)))
                .isEqualTo(new StickerImage(StickerMediaType.PNG, StickerKind.STATIC, 60_000, 40_000));
    }

    @Test
    void refusesAFileThatIsNotAnImageOfAKnownType() {
        assertRefused("just some text, not an image".getBytes(StandardCharsets.US_ASCII), StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

    @Test
    void refusesAJpegBySignature() {
        assertRefused(new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0 },
                StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

    @Test
    void refusesAnEmptyFile() {
        assertRefused(new byte[0], StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 1, 5, 7 })
    void refusesWhatIsShorterThanTheSignature(int length) {
        assertRefused(Arrays.copyOf(png(8, 8), length), StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 1, 2, 3, 4, 5, 6, 7 })
    void refusesAFileWhoseSignatureIsWrongAtOnlyOneByte(int position) {
        byte[] png = png(8, 8);
        png[position] ^= 0x01;

        assertRefused(png, StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

    @ParameterizedTest
    @ValueSource(ints = { 8, 9, 15, 16, 20, 28, 32 })
    void refusesAPngCutInsideItsHeader(int length) {
        assertRefused(Arrays.copyOf(png(64, 64), length), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAPngWhoseFirstChunkIsNotTheHeader() {
        byte[] png = png(64, 64);
        byte[] shifted = concat(Arrays.copyOf(png, 8), pngChunk("gAMA", new byte[4]), Arrays.copyOfRange(png, 8, png.length));

        assertRefused(shifted, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(ints = { 12, 14 })
    void refusesAHeaderThatIsNotThirteenBytesEvenWhenItSaysAnImageSize(int length) {
        // The data starts with the real width and height, so only its length can be what is wrong.
        byte[] png = png(64, 64);
        byte[] data = Arrays.copyOfRange(png, 16, 16 + length);
        byte[] odd = concat(Arrays.copyOf(png, 8), pngChunk("IHDR", data), Arrays.copyOfRange(png, PNG_AFTER_IHDR, png.length));

        assertRefused(odd, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAFirstChunkThatIsThirteenBytesButNotAnIhdr() {
        // Same size, same data: only the name of the chunk is wrong.
        byte[] png = png(64, 64);
        System.arraycopy("pHYs".getBytes(StandardCharsets.US_ASCII), 0, png, 12, 4);

        assertRefused(png, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(longs = { 0L, 0x80000000L, 0xFFFFFFFFL })
    void refusesADimensionThatIsZeroOrDoesNotFitAnInt(long side) {
        assertRefused(pngSaying(png(8, 8), side, 8), StickerErrorCode.STICKER_INVALID_IMAGE);
        assertRefused(pngSaying(png(8, 8), 8, side), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAPngWithoutImageData() {
        byte[] png = png(64, 64);
        byte[] bare = concat(Arrays.copyOf(png, PNG_AFTER_IHDR), pngChunk("IEND", new byte[0]));

        assertRefused(bare, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAPngThatEndsBeforeItsImageData() {
        assertRefused(Arrays.copyOf(png(64, 64), PNG_AFTER_IHDR), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesAChunkThatClaimsMoreBytesThanThereAre() {
        byte[] png = png(64, 64);
        byte[] lying = concat(Arrays.copyOf(png, PNG_AFTER_IHDR), chunkHeader(0xFFFFFFFFL, "tEXt"), new byte[] { 1, 2, 3 });

        assertThatThrownBy(() -> StickerImage.read(lying)).isInstanceOfSatisfying(SinoException.class, e -> {
            assertThat(e.errorCode()).isEqualTo(StickerErrorCode.STICKER_INVALID_IMAGE);
            assertThat(e.getMessage()).contains("past the end");
        });
    }

    @Test
    void refusesAChunkThatRunsPastTheEndByAFewBytesAndSaysSo() {
        byte[] png = png(64, 64);
        byte[] short3 = concat(Arrays.copyOf(png, PNG_AFTER_IHDR), chunkHeader(100, "tEXt"), new byte[] { 1, 2, 3 });

        assertThatThrownBy(() -> StickerImage.read(short3)).isInstanceOfSatisfying(SinoException.class, e -> {
            assertThat(e.errorCode()).isEqualTo(StickerErrorCode.STICKER_INVALID_IMAGE);
            assertThat(e.getMessage()).contains("past the end");
        });
    }

    @Test
    void refusesAHeaderOfFourteenBytesEvenWhenImageDataHappensToStartWhereTheWalkBegins() {
        // The walk starts 33 bytes in, as after a header of 13 bytes. This one has 14, so it ends at 34: the last byte of
        // its CRC and the three after it make a chunk length of 0, and an IDAT follows. Only the length of the header tells.
        byte[] png = png(64, 64);
        byte[] ihdr14 = pngChunk("IHDR", concat(Arrays.copyOfRange(png, 16, 29), new byte[1]));
        byte[] hostile = concat(Arrays.copyOf(png, 8), ihdr14, new byte[3], "IDAT".getBytes(StandardCharsets.US_ASCII), new byte[8]);

        assertRefused(hostile, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    /**
     * The length of a chunk is an unsigned 32-bit number. Read as signed, one of these would be negative and the walk
     * would go back or stand still on the same chunk for ever: a file of a few bytes would hold a thread of the server.
     */
    @ParameterizedTest
    @ValueSource(longs = { 0xFFFFFFF4L, 0xFFFFFFFFL, 0x80000000L })
    @Timeout(value = 5, threadMode = Timeout.ThreadMode.SEPARATE_THREAD)
    void aChunkLengthThatIsNegativeAsSignedDoesNotHoldTheWalkBackOrStill(long length) {
        byte[] png = png(64, 64);
        byte[] hostile = concat(Arrays.copyOf(png, PNG_AFTER_IHDR), chunkHeader(length, "tEXt"), new byte[16]);

        assertRefused(hostile, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesImageDataThatComesAfterTheEndOfTheFile() {
        byte[] png = png(64, 64);
        byte[] afterEnd = concat(Arrays.copyOf(png, PNG_AFTER_IHDR), pngChunk("IEND", new byte[0]), pngChunk("IDAT", new byte[8]));

        assertRefused(afterEnd, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    private static byte[] chunkHeader(long length, String type) {
        return ByteBuffer.allocate(8).putInt((int) length).put(type.getBytes(StandardCharsets.US_ASCII)).array();
    }

}
