package dev.sino.sticker.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import dev.sino.sticker.domain.StickerPack;

public interface StickerPackRepository extends JpaRepository<StickerPack, UUID> {

    Optional<StickerPack> findByIdAndOwnerId(UUID id, UUID ownerId);

    /** The packs of an owner, the oldest first, as the tabs of Zalo (D-342). */
    List<StickerPack> findByOwnerIdOrderByCreatedAtAscIdAsc(UUID ownerId);

    long countByOwnerId(UUID ownerId);

    /**
     * The pack of an owner with this name whatever its case, compared by PostgreSQL's own {@code lower}, as the unique
     * index {@code sticker_pack_user_name_uq} compares names, so the check and the index never disagree.
     */
    @Query("select p from StickerPack p where p.ownerId = :ownerId and lower(p.name) = lower(:name)")
    Optional<StickerPack> findNamed(@Param("ownerId") UUID ownerId, @Param("name") String name);

    /**
     * Deletes a pack of the owner; its stickers stay, in no pack (the foreign key of {@code sticker} sets
     * {@code pack_id} to NULL, DN-1).
     *
     * @return 1 when it was deleted, 0 when the owner has no such pack
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from StickerPack p where p.id = :id and p.ownerId = :ownerId")
    int deleteOwned(@Param("id") UUID id, @Param("ownerId") UUID ownerId);

}
