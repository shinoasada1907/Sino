package dev.sino.sticker.domain;

import java.nio.charset.StandardCharsets;

/**
 * The blocks of a GIF, read just far enough to know its size and whether it moves. A GIF is a header ({@code GIF87a} or
 * {@code GIF89a}), a screen descriptor (width and height as unsigned 16-bit numbers, little-endian, and a flag byte
 * that says whether a global colour table follows), and then blocks until a trailer: an extension ({@code 0x21}, a
 * label, and sub-blocks), an image ({@code 0x2C}, a descriptor of 9 bytes, an optional local colour table, a byte for
 * the LZW code size and sub-blocks), or the trailer ({@code 0x3B}). The sub-blocks are chains of a length byte and that
 * many bytes, ended by a length of 0, so a {@code 0x2C} inside them is data and not a frame. A second image block says
 * the file moves, and the walk stops there; the data of the images is never decoded.
 */
final class GifHead {

    private static final int HEADER = 6;
    private static final int SCREEN_DESCRIPTOR = 7;
    private static final int FIRST_BLOCK = HEADER + SCREEN_DESCRIPTOR;
    private static final int IMAGE_DESCRIPTOR = 10; // the 0x2C and 9 bytes

    private static final int EXTENSION = 0x21;
    private static final int IMAGE = 0x2C;
    private static final int TRAILER = 0x3B;

    private GifHead() {
    }

    /** True when the file starts with {@code GIF87a} or {@code GIF89a}. */
    static boolean matches(byte[] content) {
        if (content.length < HEADER) {
            return false;
        }
        String head = new String(content, 0, HEADER, StandardCharsets.ISO_8859_1);
        return "GIF87a".equals(head) || "GIF89a".equals(head);
    }

    static StickerImage read(byte[] content) {
        if (content.length < FIRST_BLOCK) {
            throw StickerImage.invalid("The GIF ends before its screen descriptor does.");
        }
        int width = littleEndian16(content, HEADER);
        int height = littleEndian16(content, HEADER + 2);
        if (width < 1 || height < 1) {
            throw StickerImage.invalid("The GIF says a screen of " + width + " x " + height + " px.");
        }

        int position = FIRST_BLOCK + colourTableBytes(content[HEADER + 4]);
        int frames = 0;
        // A file that ends right after a block, without its trailer, is taken as it is: players show it.
        while (position < content.length && (content[position] & 0xFF) != TRAILER) {
            switch (content[position] & 0xFF) {
                case EXTENSION -> position = afterExtension(content, position);
                case IMAGE -> {
                    frames++;
                    if (frames == 2) {
                        return new StickerImage(StickerMediaType.GIF, StickerKind.ANIMATED, width, height);
                    }
                    position = afterImage(content, position);
                }
                default -> throw StickerImage.invalid("The GIF has a block that is not an extension, an image or the end.");
            }
        }
        if (frames == 0) {
            throw StickerImage.invalid("The GIF has no image.");
        }
        return new StickerImage(StickerMediaType.GIF, StickerKind.STATIC, width, height);
    }

    /** The bytes of a colour table, from the flag byte of the screen or of an image: bit 7 says there is one, bits 0-2 its size. */
    private static int colourTableBytes(byte flags) {
        return (flags & 0x80) == 0 ? 0 : 3 << ((flags & 0x07) + 1);
    }

    private static int afterExtension(byte[] content, int position) {
        // The introducer and the label, then the sub-blocks (which report a file that ends before them).
        return afterSubBlocks(content, position + 2);
    }

    private static int afterImage(byte[] content, int position) {
        if (position + IMAGE_DESCRIPTOR > content.length) {
            throw truncated();
        }
        int next = position + IMAGE_DESCRIPTOR + colourTableBytes(content[position + IMAGE_DESCRIPTOR - 1]);
        // The code size byte, then the sub-blocks of the data (which report a file that ends before them).
        return afterSubBlocks(content, next + 1);
    }

    /**
     * Skips a chain of sub-blocks, a length byte and that many bytes each, up to and including the one of length 0.
     * A length that runs past the end of the file moves the position past it, and the check at the top of the next turn
     * reports it; the block of length 0 that ends the chain always lies inside the file, since its length byte did.
     */
    private static int afterSubBlocks(byte[] content, int position) {
        while (true) {
            if (position >= content.length) {
                throw truncated();
            }
            int length = content[position] & 0xFF;
            position += 1 + length;
            if (length == 0) {
                return position;
            }
        }
    }

    private static int littleEndian16(byte[] content, int index) {
        return (content[index] & 0xFF) | (content[index + 1] & 0xFF) << 8;
    }

    private static RuntimeException truncated() {
        return StickerImage.invalid("The GIF ends in the middle of a block.");
    }

}
