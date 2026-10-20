package dev.sino.sticker.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.sino.sticker.domain.StickerPack;

public interface StickerPackRepository extends JpaRepository<StickerPack, UUID> {

    Optional<StickerPack> findByIdAndOwnerId(UUID id, UUID ownerId);

    /** The packs of an owner, the oldest first, as the tabs of Zalo (D-342). */
    List<StickerPack> findByOwnerIdOrderByCreatedAtAscIdAsc(UUID ownerId);

    long countByOwnerId(UUID ownerId);

}
