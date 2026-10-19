package dev.sino.sticker.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.sticker.domain.Sticker;

/** The metadata of the stickers. Every question names the owner (D-336); none of them reads the bytes (D-331). */
public interface StickerRepository extends JpaRepository<Sticker, UUID> {

    /** Every sticker of an owner, newest first; the ID (UUIDv7) orders stickers kept at the same moment. */
    List<Sticker> findByOwnerIdOrderByCreatedAtDescIdDesc(UUID ownerId);

    Optional<Sticker> findByIdAndOwnerId(UUID id, UUID ownerId);

    /** The sticker of an owner that is this file, by the SHA-256 of its bytes. */
    Optional<Sticker> findByOwnerIdAndSha256(UUID ownerId, byte[] sha256);

    long countByOwnerId(UUID ownerId);

    /**
     * Deletes a sticker of the owner; its bytes go with it (the foreign key of {@code sticker_content} cascades).
     *
     * @return 1 when it was deleted, 0 when the owner has no such sticker
     */
    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from Sticker s where s.id = :id and s.ownerId = :ownerId")
    int deleteOwned(@Param("id") UUID id, @Param("ownerId") UUID ownerId);

}
