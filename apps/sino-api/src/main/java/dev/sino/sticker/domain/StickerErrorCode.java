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
    STICKER_INVALID_IMAGE(ErrorCategory.INVALID);

    private final ErrorCategory category;

    StickerErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

}
