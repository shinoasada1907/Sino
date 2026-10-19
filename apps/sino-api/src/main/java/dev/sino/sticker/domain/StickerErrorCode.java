package dev.sino.sticker.domain;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;

/**
 * Errors of the sticker module that reach API clients (custom-stickers, D-334).
 */
public enum StickerErrorCode implements ErrorCode {

    /** The file is not a PNG, a GIF or a WebP, judged by what is in it and not by its name or declared type (415). */
    STICKER_TYPE_UNSUPPORTED(ErrorCategory.UNSUPPORTED_MEDIA_TYPE),

    /** The type is right but the head of the file is broken, or the image is larger than the limit allows (422). */
    STICKER_INVALID_IMAGE(ErrorCategory.INVALID),

    /** No file was sent, or it is empty (422). */
    STICKER_FILE_MISSING(ErrorCategory.INVALID),

    /** The file is larger than the limit of the library (413). */
    STICKER_TOO_LARGE(ErrorCategory.PAYLOAD_TOO_LARGE),

    /** The owner keeps this very file already; the problem names the sticker as {@code stickerId} (409, DN-2). */
    STICKER_DUPLICATE(ErrorCategory.CONFLICT),

    /** The owner keeps as many stickers as the library allows (409). */
    STICKER_LIMIT_REACHED(ErrorCategory.CONFLICT),

    /**
     * No sticker with this ID belongs to the caller. A sticker of another owner is reported the same way, so that no ID
     * can be found out by trying (404, D-336).
     */
    STICKER_NOT_FOUND(ErrorCategory.NOT_FOUND);

    private final ErrorCategory category;

    StickerErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

}
