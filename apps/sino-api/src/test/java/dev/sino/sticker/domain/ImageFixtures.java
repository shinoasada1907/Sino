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

    /** A real WebP kept under {@code src/test/resources/sticker} (the JDK cannot write one). */
    static byte[] webpFile(String name) {
        try (java.io.InputStream in = ImageFixtures.class.getResourceAsStream("/sticker/" + name)) {
            if (in == null) {
                throw new IllegalStateException("No test resource sticker/" + name);
            }
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** One RIFF chunk: its four letters, its size as little-endian 32 bits, the payload, and a pad byte when the size is odd. */
    static byte[] riffChunk(String fourCc, byte[] payload) {
        ByteBuffer chunk = ByteBuffer.allocate(8 + payload.length + (payload.length & 1)).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        chunk.put(fourCc.getBytes(StandardCharsets.US_ASCII)).putInt(payload.length).put(payload);
        return chunk.array();
    }

    /** A WebP file around the given chunks: {@code RIFF}, the size, {@code WEBP}. */
    static byte[] webpOf(byte[]... chunks) {
        byte[] body = concat(chunks);
        ByteBuffer file = ByteBuffer.allocate(12 + body.length).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        file.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(4 + body.length).put("WEBP".getBytes(StandardCharsets.US_ASCII)).put(body);
        return file.array();
    }

    /** The payload of a lossy chunk that says a size: a key frame tag, the start code, then the 14-bit sizes. */
    static byte[] vp8Payload(int width, int height) {
        return ByteBuffer.allocate(10 + 4).order(java.nio.ByteOrder.LITTLE_ENDIAN)
                .put(new byte[] { 0x10, 0x00, 0x00, (byte) 0x9D, 0x01, 0x2A }).putShort((short) width).putShort((short) height).array();
    }

    /** The payload of a lossless chunk that says a size: the signature, then the width and height minus one in 14 bits each. */
    static byte[] vp8lPayload(int width, int height) {
        return ByteBuffer.allocate(5 + 4).order(java.nio.ByteOrder.LITTLE_ENDIAN).put((byte) 0x2F)
                .putInt((width - 1) | (height - 1) << 14).array();
    }

    /** The payload of an extended chunk: flags, 3 reserved bytes, then the canvas width and height minus one in 24 bits each. */
    static byte[] vp8xPayload(int flags, int width, int height) {
        ByteBuffer payload = ByteBuffer.allocate(10).order(java.nio.ByteOrder.LITTLE_ENDIAN).put((byte) flags).put(new byte[3]);
        payload.put((byte) (width - 1)).put((byte) ((width - 1) >> 8)).put((byte) ((width - 1) >> 16));
        payload.put((byte) (height - 1)).put((byte) ((height - 1) >> 8)).put((byte) ((height - 1) >> 16));
        return payload.array();
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
