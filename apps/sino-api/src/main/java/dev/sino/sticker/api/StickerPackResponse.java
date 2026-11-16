package dev.sino.sticker.api;

import java.time.Instant;
import java.util.UUID;

import dev.sino.sticker.application.StickerPackSummary;

/**
 * One sticker pack as the API gives it (D-344): how many stickers it holds and its newest one, whose picture the web shows
 * on the pack ({@code null} for an empty pack). The owner stays inside.
 */
record StickerPackResponse(UUID id, String name, long stickerCount, UUID coverStickerId, Instant createdAt) {

    static StickerPackResponse from(StickerPackSummary pack) {
        return new StickerPackResponse(pack.id(), pack.name(), pack.stickerCount(), pack.coverStickerId(), pack.createdAt());
    }

}
