package dev.sino.sticker;

import java.util.Optional;
import java.util.UUID;

/**
 * What the sticker library lets another module ask of it (D-350): the picture of a sticker, to send it. The module that
 * sends depends on this and nothing else of the library, so it never reads the tables of the {@code sticker} module.
 */
public interface StickerPictures {

    /**
     * The picture of a sticker of {@code ownerId}, or empty when the owner has no such sticker. A sticker of another owner
     * and one that does not exist give the same empty answer (D-336), so the caller cannot tell them apart.
     */
    Optional<StickerPictureForSending> forOwner(UUID ownerId, UUID stickerId);

}
