package dev.sino.identity.infrastructure;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface UserAvatarRepository extends JpaRepository<UserAvatar, UUID> {

    /** The digest alone: the bytes of the picture are not read. */
    @Query("select a.sha256 from UserAvatar a where a.userId = :userId")
    Optional<byte[]> findSha256ByUserId(UUID userId);

    @Modifying
    @Query("delete from UserAvatar a where a.userId = :userId")
    int deleteByUserId(UUID userId);

}
