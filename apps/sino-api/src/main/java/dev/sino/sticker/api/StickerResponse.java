package dev.sino.sticker.api;

import java.time.Instant;
import java.util.UUID;

import dev.sino.sticker.domain.Sticker;
import dev.sino.sticker.domain.StickerKind;

/**
 * One sticker as the API gives it (D-334): what the grid needs and no bytes; the picture is at
 * {@code /api/stickers/{id}/content}. The owner and the digest stay inside.
 */
record StickerResponse(UUID id, String name, String mediaType, StickerKind kind, int width, int height, long sizeBytes,
        Instant createdAt) {

    static StickerResponse from(Sticker sticker) {
        return new StickerResponse(sticker.id(), sticker.name(), sticker.mediaType().value(), sticker.kind(), sticker.width(),
                sticker.height(), sticker.sizeBytes(), sticker.createdAt());
    }

}
