package dev.sino.identity.application;

import java.nio.charset.StandardCharsets;
import java.util.Objects;

/**
 * What the profile picture needs to know of an image file: its type and its size in pixels. The type comes from the
 * signature at the start of the file, never from its name or a declared content type, and the size is read from the
 * head of the file: no pixel is decoded, because a small PNG can say it is 60,000 px wide and decoding it would fill
 * the memory of the server. PNG, JPEG and WebP are kept (D-477). The sticker module has a reader for PNG, GIF and
 * WebP, but its classes are not open to other modules and it has no JPEG, so this is a small reader of its own.
 *
 * @param contentType {@code image/png}, {@code image/jpeg} or {@code image/webp}
 */
public record AvatarImage(String contentType, int width, int height) {

    /** The largest file kept: 1 MiB. */
    public static final int MAX_BYTES = 1024 * 1024;

    /** The largest width or height kept, in pixels. */
    public static final int MAX_SIDE = 1024;

    private static final byte[] PNG_SIGNATURE = { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

    /**
     * Reads the head of an image and judges its type and size. A file above {@link #MAX_BYTES} is not judged here:
     * {@link ProfileService} refuses it as too large.
     *
     * @throws IllegalArgumentException when the file is not a PNG, JPEG or WebP, its head is broken, or a side is
     *         above {@link #MAX_SIDE}; the message holds no text of the file
     */
    public static AvatarImage read(byte[] content) {
        Objects.requireNonNull(content, "content");
        AvatarImage image;
        if (startsWith(content, PNG_SIGNATURE)) {
            image = png(content);
        } else if (content.length >= 3 && (content[0] & 0xFF) == 0xFF && (content[1] & 0xFF) == 0xD8
                && (content[2] & 0xFF) == 0xFF) {
            image = jpeg(content);
        } else if (content.length >= 12 && "RIFF".equals(letters(content, 0)) && "WEBP".equals(letters(content, 8))) {
            image = webp(content);
        } else {
            throw new IllegalArgumentException("The picture must be a PNG, JPEG or WebP image.");
        }
        if (image.width() < 1 || image.height() < 1) {
            throw new IllegalArgumentException(
                    "The image says a size of " + image.width() + " x " + image.height() + " px.");
        }
        if (image.width() > MAX_SIDE || image.height() > MAX_SIDE) {
            throw new IllegalArgumentException("The picture is at most " + MAX_SIDE + " px wide and high, not "
                    + image.width() + " x " + image.height() + ".");
        }
        return image;
    }

    /** The first chunk of a PNG is the IHDR: 4 bytes of length, "IHDR", then width and height as 32-bit numbers. */
    private static AvatarImage png(byte[] content) {
        int ihdr = PNG_SIGNATURE.length;
        if (content.length < ihdr + 16 || !"IHDR".equals(letters(content, ihdr + 4))) {
            throw broken("PNG");
        }
        return new AvatarImage("image/png", clamp(bigEndian(content, ihdr + 8, 4)),
                clamp(bigEndian(content, ihdr + 12, 4)));
    }

    /**
     * Segments follow the start marker, each {@code FF}, a marker byte and a 2-byte length that counts itself. The
     * first start-of-frame segment ({@code C0} to {@code CF}, but not {@code C4}, {@code C8}, {@code CC}) holds the
     * size: a precision byte, then the height and the width in 16 bits each.
     */
    private static AvatarImage jpeg(byte[] content) {
        int at = 2;
        while (at + 4 <= content.length) {
            if ((content[at] & 0xFF) != 0xFF) {
                throw broken("JPEG");
            }
            int marker = content[at + 1] & 0xFF;
            if (marker == 0xFF) {
                at++;
                continue;
            }
            if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD8)) {
                at += 2;
                continue;
            }
            if (marker == 0xD9 || marker == 0xDA) {
                break;
            }
            int length = (int) bigEndian(content, at + 2, 2);
            if (marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC) {
                if (length < 8 || at + 9 > content.length) {
                    throw broken("JPEG");
                }
                return new AvatarImage("image/jpeg", (int) bigEndian(content, at + 7, 2),
                        (int) bigEndian(content, at + 5, 2));
            }
            if (length < 2) {
                throw broken("JPEG");
            }
            at += 2 + length;
        }
        throw broken("JPEG");
    }

    /**
     * A RIFF container; the first chunk, at byte 12, says the kind: {@code VP8 } (lossy), {@code VP8L} (lossless) or
     * {@code VP8X} (extended, which carries the canvas size).
     */
    private static AvatarImage webp(byte[] content) {
        int payload = 20;
        if (content.length < payload + 5) {
            throw broken("WebP");
        }
        int width;
        int height;
        switch (letters(content, 12)) {
            case "VP8 " -> {
                boolean startCode = content.length >= payload + 10 && (content[payload + 3] & 0xFF) == 0x9D
                        && (content[payload + 4] & 0xFF) == 0x01 && (content[payload + 5] & 0xFF) == 0x2A;
                if (!startCode) {
                    throw broken("WebP");
                }
                width = (int) littleEndian(content, payload + 6, 2) & 0x3FFF;
                height = (int) littleEndian(content, payload + 8, 2) & 0x3FFF;
            }
            case "VP8L" -> {
                if ((content[payload] & 0xFF) != 0x2F) {
                    throw broken("WebP");
                }
                long packed = littleEndian(content, payload + 1, 4);
                width = (int) (packed & 0x3FFF) + 1;
                height = (int) ((packed >>> 14) & 0x3FFF) + 1;
            }
            case "VP8X" -> {
                if (content.length < payload + 10) {
                    throw broken("WebP");
                }
                width = (int) littleEndian(content, payload + 4, 3) + 1;
                height = (int) littleEndian(content, payload + 7, 3) + 1;
            }
            default -> throw broken("WebP");
        }
        return new AvatarImage("image/webp", width, height);
    }

    private static IllegalArgumentException broken(String type) {
        return new IllegalArgumentException("The " + type + " image is broken.");
    }

    private static boolean startsWith(byte[] content, byte[] prefix) {
        if (content.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (content[i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }

    private static String letters(byte[] content, int index) {
        return new String(content, index, 4, StandardCharsets.ISO_8859_1);
    }

    private static long bigEndian(byte[] content, int index, int length) {
        long value = 0;
        for (int i = 0; i < length; i++) {
            value = value << 8 | (content[index + i] & 0xFF);
        }
        return value;
    }

    private static long littleEndian(byte[] content, int index, int length) {
        long value = 0;
        for (int i = length - 1; i >= 0; i--) {
            value = value << 8 | (content[index + i] & 0xFF);
        }
        return value;
    }

    /** A size read as an unsigned 32-bit number, kept inside an int: anything that large is refused as too wide. */
    private static int clamp(long size) {
        return (int) Math.min(size, Integer.MAX_VALUE);
    }

}
