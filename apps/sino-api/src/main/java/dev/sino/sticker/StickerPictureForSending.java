package dev.sino.sticker;

import java.util.Arrays;
import java.util.Objects;

/**
 * The picture of a sticker as the module that sends it needs it (D-350): the bytes, the media type to send them as
 * ({@code image/png}, {@code image/gif} or {@code image/webp}) and the size in pixels. Nothing of the sticker's name, pack
 * or owner. The bytes are the user's picture: the record copies them in and out, and its text says their number, never
 * their values.
 */
public record StickerPictureForSending(byte[] bytes, String mediaType, int width, int height) {

    public StickerPictureForSending {
        Objects.requireNonNull(bytes, "bytes");
        Objects.requireNonNull(mediaType, "mediaType");
        bytes = bytes.clone();
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof StickerPictureForSending that && Arrays.equals(bytes, that.bytes)
                && mediaType.equals(that.mediaType) && width == that.width && height == that.height;
    }

    @Override
    public int hashCode() {
        return Objects.hash(Arrays.hashCode(bytes), mediaType, width, height);
    }

    @Override
    public String toString() {
        return "StickerPictureForSending[mediaType=" + mediaType + ", size=" + width + "x" + height + ", bytes="
                + bytes.length + "]";
    }

}
