package dev.sino.provider.spi;

import java.util.Arrays;
import java.util.Map;
import java.util.Objects;

/**
 * A picture to send as a message (D-349), a sticker today. It is checked where it is made, so a connector never gets one it
 * cannot send: a PNG, GIF or WebP of 1 byte to 1 MiB (the limit of a sticker in the library), at most 16384 pixels each
 * way, with a file name that is only a name and ends as its type does, since sino-zalo, and zca-js behind it, take the
 * kind of a file from the end of its name. The bytes are the user's picture: the record copies them in and out, and
 * its text says their number, never their values.
 */
public record OutgoingImage(byte[] bytes, String mediaType, String fileName, int width, int height) {

    public static final int MAX_BYTES = 1024 * 1024;
    private static final int MAX_PIXELS = 16384;
    private static final int MAX_FILE_NAME = 100;
    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/png", ".png", "image/gif", ".gif", "image/webp", ".webp");

    public OutgoingImage {
        Objects.requireNonNull(bytes, "bytes must not be null");
        if (bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw new IllegalArgumentException("bytes must be 1 byte to 1 MiB, not " + bytes.length + " bytes");
        }
        String extension = mediaType == null ? null : EXTENSIONS.get(mediaType);
        if (extension == null) {
            throw new IllegalArgumentException("mediaType must be image/png, image/gif or image/webp");
        }
        if (width < 1 || width > MAX_PIXELS || height < 1 || height > MAX_PIXELS) {
            throw new IllegalArgumentException(
                    "size must be 1 to " + MAX_PIXELS + " pixels each way, not " + width + "x" + height);
        }
        if (!isNameEndingIn(fileName, extension)) {
            throw new IllegalArgumentException("fileName must be a name of at most " + MAX_FILE_NAME
                    + " characters, without a path, ending in " + extension);
        }
        bytes = bytes.clone();
    }

    private static boolean isNameEndingIn(String fileName, String extension) {
        if (fileName == null || fileName.length() > MAX_FILE_NAME || !fileName.endsWith(extension)) {
            return false;
        }
        String stem = fileName.substring(0, fileName.length() - extension.length());
        return !stem.isBlank() && stem.indexOf('/') < 0 && stem.indexOf('\\') < 0
                && stem.chars().noneMatch(Character::isISOControl);
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof OutgoingImage that && Arrays.equals(bytes, that.bytes)
                && mediaType.equals(that.mediaType) && fileName.equals(that.fileName)
                && width == that.width && height == that.height;
    }

    @Override
    public int hashCode() {
        return Objects.hash(Arrays.hashCode(bytes), mediaType, fileName, width, height);
    }

    @Override
    public String toString() {
        return "OutgoingImage[mediaType=" + mediaType + ", fileName=" + fileName + ", size=" + width + "x" + height
                + ", bytes=" + bytes.length + "]";
    }

}
