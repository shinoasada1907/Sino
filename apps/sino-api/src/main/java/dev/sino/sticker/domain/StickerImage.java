package dev.sino.sticker.domain;

import java.util.Objects;

import dev.sino.common.error.SinoException;

/**
 * What the library needs to know of an image: its type, whether it moves, and its size in pixels. Everything is read
 * from the head of the file; no pixel is decoded (D-332). A PNG that is small in bytes can still say it is 60,000 px
 * wide, and decoding it would fill the memory of the server, so the size is read from the head and judged before any
 * decoding could happen.
 */
public record StickerImage(StickerMediaType mediaType, StickerKind kind, int width, int height) {

    public StickerImage {
        Objects.requireNonNull(mediaType, "mediaType");
        Objects.requireNonNull(kind, "kind");
        if (width < 1 || height < 1) {
            throw new IllegalArgumentException("An image is at least 1 x 1 px, not " + width + " x " + height);
        }
    }

    /**
     * Reads the head of an image. The type comes from the signature at the start of the file, never from its name or
     * a declared content type.
     *
     * @throws SinoException {@code STICKER_TYPE_UNSUPPORTED} when the file is not a known type,
     *         {@code STICKER_INVALID_IMAGE} when the type is right and the head is not
     */
    public static StickerImage read(byte[] content) {
        Objects.requireNonNull(content, "content");
        if (PngHead.matches(content)) {
            return PngHead.read(content);
        }
        throw new SinoException(StickerErrorCode.STICKER_TYPE_UNSUPPORTED, "Only PNG, GIF and WebP images are kept.");
    }

    /** The head of a file of a known type is broken. */
    static SinoException invalid(String why) {
        return new SinoException(StickerErrorCode.STICKER_INVALID_IMAGE, why);
    }

}
