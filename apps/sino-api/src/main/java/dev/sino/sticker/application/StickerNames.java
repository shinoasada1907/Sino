package dev.sino.sticker.application;

import dev.sino.sticker.domain.Sticker;

/**
 * How a sticker gets its name (D-334): the name the user asked for, else the name of the file without its extension, else
 * {@code Sticker}. A name has no control characters, no spaces around it, and at most
 * {@value Sticker#MAX_NAME_LENGTH} code points (an emoji outside the BMP counts once and is never cut in half).
 */
final class StickerNames {

    static final String DEFAULT = "Sticker";

    private StickerNames() {
    }

    /**
     * @param requested the name the user typed, or {@code null}; blank is no name
     * @param fileName the name of the uploaded file, or {@code null}; a path (as some older browsers send) is cut to its
     *        last part
     */
    static String of(String requested, String fileName) {
        String name = clean(requested);
        if (name.isEmpty()) {
            name = clean(withoutExtension(lastPartOf(fileName)));
        }
        return name.isEmpty() ? DEFAULT : name;
    }

    private static String lastPartOf(String fileName) {
        if (fileName == null) {
            return "";
        }
        return fileName.substring(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
    }

    /** Without what follows the last dot; a name of nothing but dots has nothing left. */
    private static String withoutExtension(String name) {
        int dot = name.lastIndexOf('.');
        String stem = dot < 0 ? name : name.substring(0, dot);
        return stem.chars().allMatch(c -> c == '.') ? "" : stem;
    }

    /** No control characters, trimmed, cut to the limit, trimmed again (the cut may have left a space at the end). */
    private static String clean(String name) {
        if (name == null) {
            return "";
        }
        String visible = name.codePoints().filter(codePoint -> !Character.isISOControl(codePoint))
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString().strip();
        if (visible.codePointCount(0, visible.length()) > Sticker.MAX_NAME_LENGTH) {
            visible = visible.substring(0, visible.offsetByCodePoints(0, Sticker.MAX_NAME_LENGTH)).strip();
        }
        return visible;
    }

}
