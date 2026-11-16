package dev.sino.sticker.domain;

import static dev.sino.sticker.domain.ImageFixtures.riffChunk;
import static dev.sino.sticker.domain.ImageFixtures.vp8Payload;
import static dev.sino.sticker.domain.ImageFixtures.vp8lPayload;
import static dev.sino.sticker.domain.ImageFixtures.vp8xPayload;
import static dev.sino.sticker.domain.ImageFixtures.webpFile;
import static dev.sino.sticker.domain.ImageFixtures.webpOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.common.error.SinoException;

/**
 * Reading the type, kind and size of a WebP from its first chunk (ST-04, D-332). A WebP is a RIFF file: {@code RIFF}, a
 * size, {@code WEBP}, then chunks. The first one says what kind it is: {@code VP8 } (lossy), {@code VP8L} (lossless) or
 * {@code VP8X} (extended: flags, among them the animation flag, and the size of the canvas). The real files come from
 * libwebp (see the README in {@code src/test/resources/sticker}); the cases a real file cannot give are built by hand.
 */
class StickerImageWebpTests {

    // Where the first chunk starts and where its payload starts, in a WebP file.
    private static final int CHUNK = 12;
    private static final int PAYLOAD = 20;

    private static void assertRefused(byte[] content, StickerErrorCode code) {
        assertThatThrownBy(() -> StickerImage.read(content)).isInstanceOfSatisfying(SinoException.class,
                e -> assertThat(e.errorCode()).isEqualTo(code));
    }

    private static StickerImage webp(StickerKind kind, int width, int height) {
        return new StickerImage(StickerMediaType.WEBP, kind, width, height);
    }

    @Test
    void readsALossyWebpMadeByLibwebp() {
        // 300 = 0x012C: the width spans two bytes.
        assertThat(StickerImage.read(webpFile("static-lossy.webp"))).isEqualTo(webp(StickerKind.STATIC, 300, 200));
        assertThat(StickerImage.read(webpFile("static-lossy.webp")).mediaType().value()).isEqualTo("image/webp");
    }

    @Test
    void readsALosslessWebpMadeByLibwebp() {
        // The size is 14 bits for each side packed in 28 bits, minus one: 301 x 199 is stored as 300 and 198.
        assertThat(StickerImage.read(webpFile("static-lossless.webp"))).isEqualTo(webp(StickerKind.STATIC, 301, 199));
    }

    @Test
    void readsAnExtendedWebpWithAlphaAsStill() {
        assertThat(StickerImage.read(webpFile("static-alpha.webp"))).isEqualTo(webp(StickerKind.STATIC, 50, 34));
    }

    @Test
    void readsAnAnimatedWebpAsAnimated() {
        assertThat(StickerImage.read(webpFile("animated.webp"))).isEqualTo(webp(StickerKind.ANIMATED, 32, 24));
    }

    @Test
    void theAnimationFlagAloneMakesAnExtendedWebpAnimated() {
        byte[] still = webpFile("static-alpha.webp");
        byte[] moving = webpFile("animated.webp");
        still[PAYLOAD] |= 0x02;
        moving[PAYLOAD] &= ~0x02;

        assertThat(StickerImage.read(still).kind()).isEqualTo(StickerKind.ANIMATED);
        assertThat(StickerImage.read(moving).kind()).isEqualTo(StickerKind.STATIC);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0x00, 0x10, 0x20, 0x08, 0x04, 0x01, 0xFD, 0xFC })
    void everyOtherFlagLeavesAnExtendedWebpStill(int flags) {
        // Alpha, ICC profile, EXIF, XMP and the reserved bits say nothing about motion.
        assertThat(StickerImage.read(webpOf(riffChunk("VP8X", vp8xPayload(flags, 10, 10)))).kind()).isEqualTo(StickerKind.STATIC);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0x02, 0x12, 0x03, 0xFF, 0x82 })
    void theAnimationBitIsTheOneAtValueTwoWhateverElseIsSet(int flags) {
        assertThat(StickerImage.read(webpOf(riffChunk("VP8X", vp8xPayload(flags, 10, 10)))).kind()).isEqualTo(StickerKind.ANIMATED);
    }

    @ParameterizedTest
    @CsvSource({ "1,1", "2,3", "255,256", "256,255", "300,200", "8192,4097", "16383,16383" })
    void readsTheFourteenBitSizesOfALossyHead(int width, int height) {
        assertThat(StickerImage.read(webpOf(riffChunk("VP8 ", vp8Payload(width, height))))).isEqualTo(webp(StickerKind.STATIC, width, height));
    }

    @ParameterizedTest
    @CsvSource({ "1,1", "2,3", "256,255", "300,200", "8192,4097", "16384,1", "1,16384", "16384,16384" })
    void readsThePackedSizesOfALosslessHead(int width, int height) {
        assertThat(StickerImage.read(webpOf(riffChunk("VP8L", vp8lPayload(width, height))))).isEqualTo(webp(StickerKind.STATIC, width, height));
    }

    @ParameterizedTest
    @CsvSource({ "1,1", "2,3", "256,255", "65536,1", "1,65536", "65537,300", "16777216,16777216" })
    void readsTheCanvasSizeOfAnExtendedHeadInThreeBytes(int width, int height) {
        // Whether this is too big is for the service; the head only says it.
        assertThat(StickerImage.read(webpOf(riffChunk("VP8X", vp8xPayload(0, width, height))))).isEqualTo(webp(StickerKind.STATIC, width, height));
    }

    @Test
    void ignoresTheScalingBitsOfALossyHead() {
        // The two high bits of each lossy side are an upscaling hint, not part of the size.
        byte[] file = webpFile("static-lossy.webp");
        file[PAYLOAD + 7] |= (byte) 0xC0;
        file[PAYLOAD + 9] |= (byte) 0x40;

        assertThat(StickerImage.read(file)).isEqualTo(webp(StickerKind.STATIC, 300, 200));
    }

    @Test
    void doesNotCheckTheRiffSizeAndDoesNotNeedTheWholeFile() {
        byte[] wrongSize = webpFile("static-lossy.webp");
        Arrays.fill(wrongSize, 4, 8, (byte) 0);
        byte[] onlyTheHead = Arrays.copyOf(webpFile("static-lossy.webp"), PAYLOAD + 10);

        assertThat(StickerImage.read(wrongSize)).isEqualTo(webp(StickerKind.STATIC, 300, 200));
        assertThat(StickerImage.read(onlyTheHead)).isEqualTo(webp(StickerKind.STATIC, 300, 200));
    }

    @ParameterizedTest
    @ValueSource(longs = { 10, 65_536, 70_000, 0x7FFFFFFFL, 0x80000000L, 0xFFFFFFFFL })
    void readsTheSizeOfTheFirstChunkAsAnUnsigned32BitNumber(long size) {
        // A chunk may say it is huge; only that it has the bytes the head needs matters. Read as two bytes, 65,536 is 0;
        // read as signed, 0x80000000 is negative.
        byte[] file = webpFile("static-lossy.webp");
        java.nio.ByteBuffer.wrap(file).order(java.nio.ByteOrder.LITTLE_ENDIAN).putInt(CHUNK + 4, (int) size);

        assertThat(StickerImage.read(file)).isEqualTo(webp(StickerKind.STATIC, 300, 200));
    }

    @Test
    void takesAHeadOfExactlyTheBytesItNeeds() {
        // No padding after the size: the chunk says 5 bytes and the file has 5 after its header.
        byte[] lossless = webpOf(riffChunk("VP8L", Arrays.copyOf(vp8lPayload(301, 199), 5)));
        byte[] extended = webpOf(riffChunk("VP8X", vp8xPayload(0x02, 32, 24)));
        byte[] lossy = webpOf(riffChunk("VP8 ", Arrays.copyOf(vp8Payload(300, 200), 10)));

        assertThat(lossless).hasSize(PAYLOAD + 6); // the pad byte of an odd size is not part of the head
        assertThat(StickerImage.read(Arrays.copyOf(lossless, PAYLOAD + 5))).isEqualTo(webp(StickerKind.STATIC, 301, 199));
        assertThat(StickerImage.read(extended)).isEqualTo(webp(StickerKind.ANIMATED, 32, 24));
        assertThat(StickerImage.read(lossy)).isEqualTo(webp(StickerKind.STATIC, 300, 200));
    }

    @Test
    void refusesWhatIsRiffButNotWebp() {
        byte[] wave = webpFile("static-lossy.webp");
        System.arraycopy("WAVE".getBytes(StandardCharsets.US_ASCII), 0, wave, 8, 4);

        assertRefused(wave, StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 1, 3, 4, 8, 11 })
    void refusesWhatIsShorterThanTheRiffHeader(int length) {
        assertRefused(Arrays.copyOf(webpFile("static-lossy.webp"), length), StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 1, 2, 3, 8, 9, 10, 11 })
    void refusesAFileWhoseRiffOrWebpLettersAreWrongAtOneByte(int position) {
        byte[] file = webpFile("static-lossy.webp");
        file[position] ^= 0x20;

        assertRefused(file, StickerErrorCode.STICKER_TYPE_UNSUPPORTED);
    }

    @ParameterizedTest
    @ValueSource(ints = { 12, 13, 16, 19 })
    void refusesAWebpThatEndsInsideItsFirstChunkHeader(int length) {
        assertRefused(Arrays.copyOf(webpFile("static-lossy.webp"), length), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(ints = { 20, 22, 25, 26, 29 })
    void refusesALossyHeadCutBeforeItsSize(int length) {
        assertRefused(Arrays.copyOf(webpFile("static-lossy.webp"), length), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(ints = { 20, 21, 24 })
    void refusesALosslessHeadCutBeforeItsSize(int length) {
        assertRefused(Arrays.copyOf(webpFile("static-lossless.webp"), length), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(ints = { 20, 24, 27, 29 })
    void refusesAnExtendedHeadCutBeforeItsSize(int length) {
        assertRefused(Arrays.copyOf(webpFile("static-alpha.webp"), length), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(strings = { "ANIM", "ALPH", "ANMF", "EXIF", "JUNK", "VP9 " })
    void refusesAWebpThatDoesNotStartWithAVp8OrVp8lOrVp8xChunk(String fourCc) {
        assertRefused(webpOf(riffChunk(fourCc, vp8xPayload(0, 10, 10))), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 1, 2 })
    void refusesALossyHeadThatIsNotAKeyFrameWithItsStartCode(int wrongByte) {
        byte[] file = webpFile("static-lossy.webp");
        file[PAYLOAD + 3 + wrongByte] ^= 0x01;

        assertRefused(file, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesALossyFrameThatIsNotAKeyFrame() {
        // Bit 0 of the frame tag is 0 for a key frame; only a key frame can start an image.
        byte[] file = webpFile("static-lossy.webp");
        file[PAYLOAD] |= 0x01;

        assertRefused(file, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @CsvSource({ "0,200", "300,0", "16384,200", "300,16384" })
    void refusesALossyHeadWhoseSideIsZero(int width, int height) {
        // 16384 is 0x4000: only the scaling bit is set, so the 14-bit size is 0.
        assertRefused(webpOf(riffChunk("VP8 ", vp8Payload(width, height))), StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @Test
    void refusesALosslessHeadWithoutItsSignatureByteOrWithAVersion() {
        byte[] noSignature = webpFile("static-lossless.webp");
        noSignature[PAYLOAD] = 0x2E;
        byte[] version = webpFile("static-lossless.webp");
        version[PAYLOAD + 4] |= 0x20; // bit 29, the first bit of the version

        assertRefused(noSignature, StickerErrorCode.STICKER_INVALID_IMAGE);
        assertRefused(version, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

    @ParameterizedTest
    @CsvSource({ "'VP8 ',9", "VP8L,4", "VP8X,9", "'VP8 ',0", "VP8X,0" })
    void refusesAChunkWhoseSizeIsSmallerThanWhatItsHeadNeeds(String fourCc, int size) {
        // The bytes are there, but the chunk says it has fewer: what would be read is not part of it.
        byte[] file = webpFile("static-alpha.webp");
        System.arraycopy(fourCc.getBytes(StandardCharsets.US_ASCII), 0, file, CHUNK, 4);
        file[CHUNK + 4] = (byte) size;
        file[CHUNK + 5] = 0;

        assertRefused(file, StickerErrorCode.STICKER_INVALID_IMAGE);
    }

}
