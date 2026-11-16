package dev.sino.sticker.application;

import dev.sino.sticker.domain.StickerMediaType;

/** What is sent for {@code GET /api/stickers/{id}/content}: the bytes of a sticker and the type to send them as (D-335). */
public record StickerPicture(StickerMediaType mediaType, byte[] bytes) {
}
