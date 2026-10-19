package dev.sino.sticker.domain;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * The head of a PNG: an 8-byte signature, then chunks, each 4 bytes of length, 4 of type, the data, and 4 of CRC. The
 * first chunk is the IHDR (13 bytes of data, the first 8 are the width and the height as unsigned 32-bit numbers).
 * Animated PNG (APNG) puts an {@code acTL} chunk before the first {@code IDAT}; so the chunks are walked up to that
 * {@code IDAT} and no further. The CRCs are not checked and the image data is not touched.
 */
final class PngHead {

    private static final byte[] SIGNATURE = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };

    private static final int CHUNK_HEADER = 8;
    private static final int CRC = 4;
    private static final int IHDR_DATA = 13;
    private static final int FIRST_CHUNK = SIGNATURE.length;
    private static final int AFTER_IHDR = FIRST_CHUNK + CHUNK_HEADER + IHDR_DATA + CRC;

    private PngHead() {
    }

    /** True when the file starts with the whole 8-byte signature. */
    static boolean matches(byte[] content) {
        if (content.length < SIGNATURE.length) {
            return false;
        }
        for (int i = 0; i < SIGNATURE.length; i++) {
            if (content[i] != SIGNATURE[i]) {
                return false;
            }
        }
        return true;
    }

    static StickerImage read(byte[] content) {
        ByteBuffer bytes = ByteBuffer.wrap(content);
        if (content.length < FIRST_CHUNK + CHUNK_HEADER + IHDR_DATA) {
            throw StickerImage.invalid("The PNG ends before its header does.");
        }
        if (!"IHDR".equals(typeAt(content, FIRST_CHUNK)) || unsigned(bytes, FIRST_CHUNK) != IHDR_DATA) {
            throw StickerImage.invalid("A PNG starts with an IHDR chunk of 13 bytes.");
        }
        long width = unsigned(bytes, FIRST_CHUNK + CHUNK_HEADER);
        long height = unsigned(bytes, FIRST_CHUNK + CHUNK_HEADER + 4);
        if (width < 1 || height < 1 || width > Integer.MAX_VALUE || height > Integer.MAX_VALUE) {
            throw StickerImage.invalid("The PNG says a size of " + width + " x " + height + " px.");
        }

        boolean animated = false;
        long position = AFTER_IHDR;
        while (true) {
            if (position + CHUNK_HEADER > content.length) {
                throw StickerImage.invalid("The PNG has no image data.");
            }
            String type = typeAt(content, (int) position);
            if ("IDAT".equals(type)) {
                break;
            }
            if ("IEND".equals(type)) {
                throw StickerImage.invalid("The PNG has no image data.");
            }
            animated |= "acTL".equals(type);
            // The length is unsigned and comes from the file: a long, so that a bogus one cannot wrap around.
            position += CHUNK_HEADER + unsigned(bytes, (int) position) + CRC;
            if (position > content.length) {
                throw StickerImage.invalid("A chunk of the PNG goes past the end of the file.");
            }
        }
        return new StickerImage(StickerMediaType.PNG, animated ? StickerKind.ANIMATED : StickerKind.STATIC, (int) width,
                (int) height);
    }

    private static long unsigned(ByteBuffer bytes, int index) {
        return bytes.getInt(index) & 0xFFFFFFFFL;
    }

    private static String typeAt(byte[] content, int chunkStart) {
        return new String(content, chunkStart + 4, 4, StandardCharsets.ISO_8859_1);
    }

}
