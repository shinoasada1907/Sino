package dev.sino.conversation.application;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import dev.sino.provider.spi.OutgoingFile;
import dev.sino.provider.spi.OutgoingFile.Kind;

/**
 * A file the user sends from the computer, as a message can carry it (zalo-send-files, D-371). Its first bytes, not its
 * name or the type the browser gave, say whether it is a picture: a JPEG, PNG, WebP or GIF is a {@link Kind#PHOTO} of at
 * most 10 MB, sent with the ending of its real type (zca-js picks the path of a file by the end of its name); anything
 * else is a {@link Kind#FILE} of at most 25 MB, and gets {@code .bin} after a name that ends as a picture's. The name
 * loses any path and control character and keeps at most 255 characters.
 */
public final class UploadedFiles {

    private static final Map<String, String> PICTURE_ENDINGS = Map.of(
            "image/jpeg", ".jpg", "image/png", ".png", "image/webp", ".webp", "image/gif", ".gif");
    private static final Set<String> PICTURE_NAME_ENDINGS = Set.of(".jpg", ".jpeg", ".png", ".webp", ".gif");
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

    private UploadedFiles() {
    }

    /**
     * @throws dev.sino.common.error.SinoException {@code FILE_EMPTY} for no bytes, {@code FILE_TOO_LARGE} above the limit
     *         of its kind
     */
    public static OutgoingFile of(String originalName, String browserType, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw ConversationErrorCode.fileEmpty();
        }
        Optional<String> picture = pictureTypeOf(bytes);
        long limit = picture.isPresent() ? OutgoingFile.MAX_PHOTO_BYTES : OutgoingFile.MAX_FILE_BYTES;
        if (bytes.length > limit) {
            throw ConversationErrorCode.fileTooLarge(picture.isPresent(), limit);
        }
        String name = cleanName(originalName);
        if (picture.isPresent()) {
            String ending = PICTURE_ENDINGS.get(picture.get());
            return new OutgoingFile(bytes, picture.get(), fitted(stemOf(name, "anh"), ending), Kind.PHOTO);
        }
        String fileName = PICTURE_NAME_ENDINGS.contains(endingOf(name)) ? fitted(name, ".bin") : fittedKeepingEnding(name);
        return new OutgoingFile(bytes, typeOf(browserType), fileName, Kind.FILE);
    }

    /** The type of a picture a message carries, by its first bytes; empty for anything else. */
    static Optional<String> pictureTypeOf(byte[] bytes) {
        if (startsWith(bytes, PNG)) {
            return Optional.of("image/png");
        }
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
            return Optional.of("image/jpeg");
        }
        if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) {
            return Optional.of("image/gif");
        }
        if (bytes.length >= 12 && startsWith(bytes, ascii("RIFF"))
                && Arrays.equals(Arrays.copyOfRange(bytes, 8, 12), ascii("WEBP"))) {
            return Optional.of("image/webp");
        }
        return Optional.empty();
    }

    private static String cleanName(String originalName) {
        String name = originalName == null ? "" : originalName;
        name = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        name = name.codePoints().filter(point -> !Character.isISOControl(point))
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString().strip();
        return name.isEmpty() ? "tep" : name;
    }

    private static String stemOf(String name, String fallback) {
        String stem = PICTURE_NAME_ENDINGS.contains(endingOf(name)) ? name.substring(0, name.lastIndexOf('.')) : name;
        return stem.isBlank() ? fallback : stem;
    }

    // At most 255 characters with the ending, cutting the stem rather than the ending (and never half a surrogate pair).
    private static String fitted(String stem, String ending) {
        int room = OutgoingFile.MAX_FILE_NAME - ending.length();
        String cut = stem.length() <= room ? stem : stem.substring(0, Character.isHighSurrogate(stem.charAt(room - 1))
                ? room - 1 : room);
        return cut + ending;
    }

    private static String fittedKeepingEnding(String name) {
        if (name.length() <= OutgoingFile.MAX_FILE_NAME) {
            return name;
        }
        int dot = name.lastIndexOf('.');
        boolean shortEnding = dot > 0 && name.length() - dot <= 16;
        return shortEnding ? fitted(name.substring(0, dot), name.substring(dot)) : fitted(name, "");
    }

    private static String endingOf(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot).toLowerCase(Locale.ROOT);
    }

    private static String typeOf(String browserType) {
        return browserType == null || browserType.isBlank() || browserType.length() > 255
                ? "application/octet-stream" : browserType.strip();
    }

    private static boolean startsWith(byte[] bytes, byte[] head) {
        return bytes.length >= head.length && Arrays.equals(Arrays.copyOf(bytes, head.length), head);
    }

    private static byte[] ascii(String text) {
        return text.getBytes(StandardCharsets.US_ASCII);
    }

}
