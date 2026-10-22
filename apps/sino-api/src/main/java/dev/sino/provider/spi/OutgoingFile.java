package dev.sino.provider.spi;

import java.util.Arrays;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * A picture or a file from the user's computer to send as a message (zalo-send-files, D-372). It is checked where it is
 * made, so a connector never gets one it cannot send: a {@link Kind#PHOTO} is a JPEG, PNG, WebP or GIF of 1 byte to
 * 10 MiB whose name ends as its type does; a {@link Kind#FILE} is anything of 1 byte to 25 MiB whose name does not end as
 * a picture's, since sino-zalo, and zca-js behind it, take the kind of a file from the end of its name (D-371). A name is
 * only a name: at most 255 characters, no path, no control character. The bytes are the user's: the record copies them in
 * and out, and its text says their number, never their values.
 */
public record OutgoingFile(byte[] bytes, String mediaType, String fileName, Kind kind) {

    /** How the provider shows it: a picture in the chat, or a file to download. */
    public enum Kind {
        PHOTO,
        FILE
    }

    public static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    public static final int MAX_FILE_BYTES = 25 * 1024 * 1024;
    public static final int MAX_FILE_NAME = 255;
    private static final Map<String, String> PHOTO_EXTENSIONS = Map.of(
            "image/jpeg", ".jpg", "image/png", ".png", "image/webp", ".webp", "image/gif", ".gif");
    private static final Set<String> PICTURE_ENDINGS = Set.of(".jpg", ".jpeg", ".png", ".webp", ".gif");

    public OutgoingFile {
        Objects.requireNonNull(bytes, "bytes must not be null");
        Objects.requireNonNull(kind, "kind must not be null");
        int limit = kind == Kind.PHOTO ? MAX_PHOTO_BYTES : MAX_FILE_BYTES;
        if (bytes.length == 0 || bytes.length > limit) {
            throw new IllegalArgumentException(
                    "bytes must be 1 to " + limit + " for a " + kind + ", not " + bytes.length);
        }
        if (mediaType == null || mediaType.isBlank()) {
            throw new IllegalArgumentException("mediaType must not be blank");
        }
        if (!isName(fileName)) {
            throw new IllegalArgumentException("fileName must be a name of at most " + MAX_FILE_NAME
                    + " characters, without a path or a control character");
        }
        String ending = endingOf(fileName);
        if (kind == Kind.PHOTO) {
            String extension = PHOTO_EXTENSIONS.get(mediaType);
            if (extension == null || !ending.equals(extension)) {
                throw new IllegalArgumentException(
                        "a photo must be a JPEG, PNG, WebP or GIF whose name ends as its type does");
            }
        } else if (PICTURE_ENDINGS.contains(ending)) {
            throw new IllegalArgumentException("a file that is no photo must not be named as a picture");
        }
        bytes = bytes.clone();
    }

    private static boolean isName(String fileName) {
        return fileName != null && !fileName.isBlank() && fileName.length() <= MAX_FILE_NAME
                && fileName.indexOf('/') < 0 && fileName.indexOf('\\') < 0
                && fileName.chars().noneMatch(Character::isISOControl);
    }

    private static String endingOf(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot < 0 ? "" : fileName.substring(dot).toLowerCase(java.util.Locale.ROOT);
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }

    /** How many bytes, without copying them. */
    public int size() {
        return bytes.length;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof OutgoingFile that && Arrays.equals(bytes, that.bytes)
                && mediaType.equals(that.mediaType) && fileName.equals(that.fileName) && kind == that.kind;
    }

    @Override
    public int hashCode() {
        return Objects.hash(Arrays.hashCode(bytes), mediaType, fileName, kind);
    }

    @Override
    public String toString() {
        return "OutgoingFile[kind=" + kind + ", mediaType=" + mediaType + ", bytes=" + bytes.length + "]";
    }

}
