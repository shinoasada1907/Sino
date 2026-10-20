package dev.sino.sticker.infrastructure;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.sino.sticker.domain.StickerContent;

/**
 * The bytes of the stickers, by the ID of the sticker. It knows no owner: the service finds the sticker for its owner
 * first (D-336) and only then asks for its bytes.
 */
public interface StickerContentRepository extends JpaRepository<StickerContent, UUID> {
}
