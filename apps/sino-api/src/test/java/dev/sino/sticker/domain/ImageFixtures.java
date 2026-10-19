package dev.sino.sticker.domain;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

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

    /** An animated GIF the JDK encodes: {@code frames} frames of {@code width} x {@code height}, each in another colour. */
    static byte[] animatedGif(int width, int height, int frames) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("gif").next();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            try (ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
                writer.setOutput(stream);
                writer.prepareWriteSequence(null);
                for (int i = 0; i < frames; i++) {
                    BufferedImage frame = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
                    Graphics2D graphics = frame.createGraphics();
                    graphics.setColor(new Color(40 * i % 256, 90, 200));
                    graphics.fillRect(0, 0, width, height);
                    graphics.dispose();
                    writer.writeToSequence(new IIOImage(frame, null, null), null);
                }
                writer.endWriteSequence();
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            writer.dispose();
        }
    }

    // --- GIFs written by hand, for what an encoder does not make: every size of colour table, odd blocks, cuts. ---

    /**
     * A GIF: the header, a screen descriptor of {@code width} x {@code height} with a global colour table of
     * 2^(globalTableBits + 1) entries (none when {@code globalTableBits} is -1), the blocks, and the trailer.
     */
    static byte[] gifOf(int width, int height, int globalTableBits, byte[]... blocks) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes("GIF89a".getBytes(StandardCharsets.US_ASCII));
        out.writeBytes(ByteBuffer.allocate(4).order(java.nio.ByteOrder.LITTLE_ENDIAN).putShort((short) width).putShort((short) height).array());
        out.write(globalTableBits < 0 ? 0 : 0x80 | globalTableBits);
        out.write(0); // background colour
        out.write(0); // pixel aspect ratio
        if (globalTableBits >= 0) {
            out.writeBytes(new byte[3 << (globalTableBits + 1)]);
        }
        for (byte[] block : blocks) {
            out.writeBytes(block);
        }
        out.write(0x3B);
        return out.toByteArray();
    }

    /** One frame: an image descriptor, a local colour table when {@code localTableBits} is 0 or more, and its data. */
    static byte[] gifFrame(int localTableBits) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0x2C);
        out.writeBytes(new byte[8]); // left, top, width, height
        out.write(localTableBits < 0 ? 0 : 0x80 | localTableBits);
        if (localTableBits >= 0) {
            out.writeBytes(new byte[3 << (localTableBits + 1)]);
        }
        out.write(2); // LZW minimum code size
        out.writeBytes(new byte[] { 2, 0x4C, 0x01 }); // a sub-block of two bytes
        out.write(0); // end of the data
        return out.toByteArray();
    }

    /** One extension block ({@code label} 0xF9 graphic control, 0xFF application, 0xFE comment) with its sub-blocks. */
    static byte[] gifExtension(int label, byte[]... subBlocks) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0x21);
        out.write(label);
        for (byte[] subBlock : subBlocks) {
            out.write(subBlock.length);
            out.writeBytes(subBlock);
        }
        out.write(0);
        return out.toByteArray();
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
