package dev.sino.sticker.application;

import java.time.Instant;
import java.util.UUID;

/**
 * A pack of the owner as a list shows it (D-341): how many stickers it holds and its newest one, {@code null} for an
 * empty pack. Worked out when read, never stored, so it cannot drift.
 */
public record StickerPackSummary(UUID id, String name, long stickerCount, UUID coverStickerId, Instant createdAt) {
}
