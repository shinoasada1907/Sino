package dev.sino.sticker.domain;

/** Whether a sticker moves. The application works it out from the file; the user never says (D-332). */
public enum StickerKind {

    /** One frame (a GIF with a single frame is still STATIC). */
    STATIC,

    /** More than one frame: an animated GIF, WebP or PNG. */
    ANIMATED

}
