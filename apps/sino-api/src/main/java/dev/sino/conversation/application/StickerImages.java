package dev.sino.conversation.application;

import java.util.Map;

import dev.sino.provider.spi.OutgoingImage;
import dev.sino.sticker.StickerPictureForSending;

/**
 * A sticker of the library as the picture of a message (ZS-05, D-349). The file is named by its type and never by what
 * the user called the sticker, which is theirs and not Zalo's to read.
 */
final class StickerImages {

    private static final Map<String, String> EXTENSIONS = Map.of("image/png", "png", "image/gif", "gif",
            "image/webp", "webp");

    private StickerImages() {
    }

    /**
     * @throws dev.sino.common.error.SinoException {@code STICKER_NOT_SENDABLE} when a message cannot carry it: a type
     *         other than PNG, GIF or WebP, or a size above what {@link OutgoingImage} takes (the library can be set to
     *         keep stickers larger than that)
     */
    static OutgoingImage imageOf(StickerPictureForSending picture) {
        String extension = EXTENSIONS.get(picture.mediaType());
        if (extension == null) {
            throw ConversationErrorCode.stickerNotSendable("its type, " + picture.mediaType() + ", is not one a message carries");
        }
        try {
            return new OutgoingImage(picture.bytes(), picture.mediaType(), "sticker." + extension, picture.width(),
                    picture.height());
        } catch (IllegalArgumentException tooBig) {
            throw ConversationErrorCode.stickerNotSendable(tooBig.getMessage());
        }
    }

}
