package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

/**
 * The type and the size of a picture are read from the head of the file, and nothing is decoded.
 */
public class AvatarImageTests {

    public static byte[] image(String format, int width, int height) throws IOException {
        BufferedImage picture = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(picture, format, out);
        return out.toByteArray();
    }

    /** A PNG that is only a signature and an IHDR: enough for the head, and it cannot be decoded. */
    public static byte[] pngHead(long width, long height) {
        ByteBuffer bytes = ByteBuffer.allocate(24);
        bytes.put(new byte[] { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });
        bytes.putInt(13).put("IHDR".getBytes(StandardCharsets.ISO_8859_1));
        bytes.putInt((int) width).putInt((int) height);
        return bytes.array();
    }

    /** A WebP of the kind VP8L (lossless): the size is packed as width - 1 and height - 1 in 14 bits each. */
    public static byte[] webpLossless(int width, int height) {
        ByteBuffer bytes = ByteBuffer.allocate(30).order(ByteOrder.LITTLE_ENDIAN);
        bytes.put("RIFF".getBytes(StandardCharsets.ISO_8859_1)).putInt(22);
        bytes.put("WEBP".getBytes(StandardCharsets.ISO_8859_1)).put("VP8L".getBytes(StandardCharsets.ISO_8859_1));
        bytes.putInt(10).put((byte) 0x2F).putInt((width - 1) | (height - 1) << 14).put(new byte[5]);
        return bytes.array();
    }

    /** A WebP of the kind VP8X (extended): flags, 3 reserved bytes, then width - 1 and height - 1 in 24 bits each. */
    public static byte[] webpExtended(int width, int height) {
        ByteBuffer bytes = ByteBuffer.allocate(30).order(ByteOrder.LITTLE_ENDIAN);
        bytes.put("RIFF".getBytes(StandardCharsets.ISO_8859_1)).putInt(22);
        bytes.put("WEBP".getBytes(StandardCharsets.ISO_8859_1)).put("VP8X".getBytes(StandardCharsets.ISO_8859_1));
        bytes.putInt(10).put(new byte[4]);
        bytes.put((byte) (width - 1)).put((byte) ((width - 1) >> 8)).put((byte) ((width - 1) >> 16));
        bytes.put((byte) (height - 1)).put((byte) ((height - 1) >> 8)).put((byte) ((height - 1) >> 16));
        return bytes.array();
    }

    /** A WebP of the kind VP8 (lossy): a frame tag, the start code, then width and height in 16 bits each. */
    public static byte[] webpLossy(int width, int height) {
        ByteBuffer bytes = ByteBuffer.allocate(30).order(ByteOrder.LITTLE_ENDIAN);
        bytes.put("RIFF".getBytes(StandardCharsets.ISO_8859_1)).putInt(22);
        bytes.put("WEBP".getBytes(StandardCharsets.ISO_8859_1)).put("VP8 ".getBytes(StandardCharsets.ISO_8859_1));
        bytes.putInt(10).put(new byte[] { 0x10, 0, 0, (byte) 0x9D, 0x01, 0x2A });
        bytes.putShort((short) width).putShort((short) height);
        return bytes.array();
    }

    @Test
    void aPngGivesItsTypeAndSize() throws IOException {
        AvatarImage image = AvatarImage.read(image("png", 256, 128));

        assertThat(image).isEqualTo(new AvatarImage("image/png", 256, 128));
    }

    @Test
    void aJpegGivesItsTypeAndSize() throws IOException {
        AvatarImage image = AvatarImage.read(image("jpg", 100, 50));

        assertThat(image).isEqualTo(new AvatarImage("image/jpeg", 100, 50));
    }

    @Test
    void aWebpOfEachKindGivesItsTypeAndSize() {
        assertThat(AvatarImage.read(webpLossless(256, 300))).isEqualTo(new AvatarImage("image/webp", 256, 300));
        assertThat(AvatarImage.read(webpLossy(640, 480))).isEqualTo(new AvatarImage("image/webp", 640, 480));
        assertThat(AvatarImage.read(webpExtended(1000, 20))).isEqualTo(new AvatarImage("image/webp", 1000, 20));
    }

    @Test
    void aSideAtTheLimitPassesAndOneAboveItDoesNot() throws IOException {
        assertThat(AvatarImage.read(pngHead(1024, 1024)).width()).isEqualTo(1024);
        assertThatThrownBy(() -> AvatarImage.read(pngHead(1025, 10))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(pngHead(10, 1025))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(image("jpg", 1025, 10))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(webpLossless(10, 1025))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(webpExtended(5000, 10))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aHugeSizeInTheHeadIsRefusedWithoutDecoding() {
        assertThatThrownBy(() -> AvatarImage.read(pngHead(60_000, 60_000))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(pngHead(0xFFFFFFFFL, 1))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aTableSegmentBeforeTheFrameHeaderIsSkippedNotReadAsASize() {
        byte[] head = { (byte) 0xFF, (byte) 0xD8,
                (byte) 0xFF, (byte) 0xC4, 0x00, 0x06, 1, 2, 3, 4,
                (byte) 0xFF, (byte) 0xC0, 0x00, 0x0B, 8, 0x00, 0x30, 0x00, 0x40, 1, 1, 0x11, 0 };

        assertThat(AvatarImage.read(head)).isEqualTo(new AvatarImage("image/jpeg", 64, 48));
    }

    @Test
    void aSizeOfZeroIsRefused() {
        assertThatThrownBy(() -> AvatarImage.read(pngHead(0, 10))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void textAndOtherTypesAreRefused() throws IOException {
        assertThatThrownBy(() -> AvatarImage.read("this is not an image".getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(image("gif", 10, 10))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(new byte[0])).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(new byte[] { (byte) 0xFF, (byte) 0xD8 }))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aTruncatedHeadIsRefused() throws IOException {
        byte[] png = image("png", 10, 10);
        byte[] jpeg = image("jpg", 10, 10);
        assertThatThrownBy(() -> AvatarImage.read(Arrays.copyOf(png, 20))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(Arrays.copyOf(jpeg, 8))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AvatarImage.read(Arrays.copyOf(webpLossless(10, 10), 14)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aMessageNeverRepeatsTheFile() {
        assertThatThrownBy(() -> AvatarImage.read("secret words".getBytes(StandardCharsets.UTF_8)))
                .hasMessageNotContaining("secret");
    }

}
