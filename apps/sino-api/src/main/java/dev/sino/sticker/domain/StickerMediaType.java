package dev.sino.sticker.domain;

/** The kinds of image the library keeps (D-329). SVG is left out on purpose: it can carry script. */
public enum StickerMediaType {

    PNG("image/png"),
    GIF("image/gif"),
    WEBP("image/webp");

    private final String value;

    StickerMediaType(String value) {
        this.value = value;
    }

    /** The media type as it is stored and sent in {@code Content-Type}. */
    public String value() {
        return value;
    }

}
