package dev.sino.sticker.domain;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import javax.imageio.ImageIO;

/**
 * Images for the tests of the sticker library. The real ones come from the encoders of the JDK, so the reader is tried on
 * what an encoder makes and not only on bytes written by hand; the odd ones are made by cutting or patching a real one.
 */
final class ImageFixtures {

    /** Bytes of a PNG up to and including its IHDR chunk: 8 of signature, then length, type, 13 of data and the CRC. */
    static final int PNG_AFTER_IHDR = 8 + 4 + 4 + 13 + 4;

    private ImageFixtures() {
    }

    /** A PNG the JDK encodes: {@code width} x {@code height}, one frame. */
    static byte[] png(int width, int height) {
        return encode(new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB), "png");
    }

    /** A GIF the JDK encodes: {@code width} x {@code height}, one frame. */
    static byte[] gif(int width, int height) {
        return encode(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "gif");
    }

    private static byte[] encode(BufferedImage image, String format) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, format, out)) {
                throw new IllegalStateException("No writer for " + format);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** One PNG chunk: length, type, data and a CRC that is not worked out (the reader does not check it). */
    static byte[] pngChunk(String type, byte[] data) {
        ByteBuffer chunk = ByteBuffer.allocate(4 + 4 + data.length + 4);
        chunk.putInt(data.length).put(type.getBytes(StandardCharsets.US_ASCII)).put(data).putInt(0);
        return chunk.array();
    }

    /** The PNG with its IHDR saying other dimensions; {@code width} and {@code height} are the 32 bits as written. */
    static byte[] pngSaying(byte[] png, long width, long height) {
        byte[] patched = png.clone();
        ByteBuffer.wrap(patched).putInt(16, (int) width).putInt(20, (int) height);
        return patched;
    }

    /** The PNG with one more chunk right after its IHDR. */
    static byte[] pngWithChunkAfterIhdr(byte[] png, String type, byte[] data) {
        return concat(Arrays.copyOf(png, PNG_AFTER_IHDR), pngChunk(type, data), Arrays.copyOfRange(png, PNG_AFTER_IHDR, png.length));
    }

    static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) {
            out.writeBytes(part);
        }
        return out.toByteArray();
    }

}
