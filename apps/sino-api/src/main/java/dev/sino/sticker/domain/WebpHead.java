package dev.sino.sticker.domain;

import java.nio.charset.StandardCharsets;

/**
 * The first chunk of a WebP. The file is a RIFF container: {@code RIFF}, a size, {@code WEBP}, then chunks, each a four
 * letter name, a size (little-endian, 32 bits) and the payload. The first chunk says what kind it is:
 * <ul>
 * <li>{@code VP8 }, lossy: a frame tag (bit 0 is 0 for a key frame, the only kind that can start an image), the start
 * code {@code 9D 01 2A}, then the width and the height in 16 bits each, of which the low 14 are the size and the high 2
 * an upscaling hint;</li>
 * <li>{@code VP8L}, lossless: the byte {@code 2F}, then 32 bits that pack the width minus one (14 bits), the height minus
 * one (14 bits), a bit for alpha and 3 bits of version, which must be 0;</li>
 * <li>{@code VP8X}, extended: a byte of flags (value 2 is the animation flag), 3 reserved bytes, then the width and the
 * height of the canvas minus one in 24 bits each. Animated files, and those with alpha, a colour profile or metadata,
 * start with it.</li>
 * </ul>
 * The RIFF size is not checked and nothing after the first chunk is read: what is needed is the head, and no pixel is
 * decoded.
 */
final class WebpHead {

    private static final int FIRST_CHUNK = 12;
    private static final int PAYLOAD = FIRST_CHUNK + 8;

    private static final int LOSSY_NEEDS = 10;
    private static final int LOSSLESS_NEEDS = 5;
    private static final int EXTENDED_NEEDS = 10;

    private static final int ANIMATION_FLAG = 0x02;

    private WebpHead() {
    }

    /** True when the file starts with {@code RIFF}, four bytes of size, and {@code WEBP}. */
    static boolean matches(byte[] content) {
        return content.length >= FIRST_CHUNK && "RIFF".equals(letters(content, 0)) && "WEBP".equals(letters(content, 8));
    }

    static StickerImage read(byte[] content) {
        if (content.length < PAYLOAD) {
            throw StickerImage.invalid("The WebP ends before its first chunk does.");
        }
        long size = littleEndian(content, FIRST_CHUNK + 4, 4);
        return switch (letters(content, FIRST_CHUNK)) {
            case "VP8 " -> lossy(content, size);
            case "VP8L" -> lossless(content, size);
            case "VP8X" -> extended(content, size);
            default -> throw StickerImage.invalid("A WebP starts with a VP8, VP8L or VP8X chunk.");
        };
    }

    private static StickerImage lossy(byte[] content, long size) {
        requireHead(content, size, LOSSY_NEEDS);
        boolean keyFrame = (content[PAYLOAD] & 0x01) == 0;
        boolean startCode = (content[PAYLOAD + 3] & 0xFF) == 0x9D && (content[PAYLOAD + 4] & 0xFF) == 0x01
                && (content[PAYLOAD + 5] & 0xFF) == 0x2A;
        if (!keyFrame || !startCode) {
            throw StickerImage.invalid("The lossy WebP does not start with a key frame.");
        }
        int width = (int) littleEndian(content, PAYLOAD + 6, 2) & 0x3FFF;
        int height = (int) littleEndian(content, PAYLOAD + 8, 2) & 0x3FFF;
        return image(StickerKind.STATIC, width, height);
    }

    private static StickerImage lossless(byte[] content, long size) {
        requireHead(content, size, LOSSLESS_NEEDS);
        if ((content[PAYLOAD] & 0xFF) != 0x2F) {
            throw StickerImage.invalid("The lossless WebP does not start with its signature.");
        }
        long packed = littleEndian(content, PAYLOAD + 1, 4);
        if ((packed >>> 29) != 0) {
            throw StickerImage.invalid("The lossless WebP is of a version that is not known.");
        }
        int width = (int) (packed & 0x3FFF) + 1;
        int height = (int) ((packed >>> 14) & 0x3FFF) + 1;
        return image(StickerKind.STATIC, width, height);
    }

    private static StickerImage extended(byte[] content, long size) {
        requireHead(content, size, EXTENDED_NEEDS);
        StickerKind kind = (content[PAYLOAD] & ANIMATION_FLAG) != 0 ? StickerKind.ANIMATED : StickerKind.STATIC;
        int width = (int) littleEndian(content, PAYLOAD + 4, 3) + 1;
        int height = (int) littleEndian(content, PAYLOAD + 7, 3) + 1;
        return image(kind, width, height);
    }

    private static StickerImage image(StickerKind kind, int width, int height) {
        if (width < 1 || height < 1) {
            throw StickerImage.invalid("The WebP says a size of " + width + " x " + height + " px.");
        }
        return new StickerImage(StickerMediaType.WEBP, kind, width, height);
    }

    /** The chunk must say it has the bytes the head is read from, and the file must have them. */
    private static void requireHead(byte[] content, long chunkSize, int needed) {
        if (chunkSize < needed || content.length < PAYLOAD + needed) {
            throw StickerImage.invalid("The WebP ends before its head does.");
        }
    }

    private static String letters(byte[] content, int index) {
        return new String(content, index, 4, StandardCharsets.ISO_8859_1);
    }

    /** {@code length} bytes, least significant first, as an unsigned number. */
    private static long littleEndian(byte[] content, int index, int length) {
        long value = 0;
        for (int i = length - 1; i >= 0; i--) {
            value = value << 8 | (content[index + i] & 0xFF);
        }
        return value;
    }

}
