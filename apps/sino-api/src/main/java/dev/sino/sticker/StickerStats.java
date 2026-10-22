package dev.sino.sticker;

import java.util.UUID;

/** Numbers about the sticker library that other modules show, such as how much Sino keeps for a user (D-403). */
public interface StickerStats {

    /** How many bytes the pictures of the owner's stickers take, as they were kept; 0 without stickers. */
    long storedBytes(UUID ownerId);

}
