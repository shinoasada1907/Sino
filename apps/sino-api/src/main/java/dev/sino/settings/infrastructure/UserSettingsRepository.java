package dev.sino.settings.infrastructure;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import dev.sino.settings.domain.UserSettings;

/** The stored settings, one row per user, found by the user's ID. */
public interface UserSettingsRepository extends JpaRepository<UserSettings, UUID> {

    /**
     * The row of the user, locked until the transaction ends ({@code SELECT ... FOR UPDATE}), so a second change of the
     * same settings waits for the first to commit and then reads what it wrote.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from UserSettings s where s.userId = :userId")
    Optional<UserSettings> findForUpdate(@Param("userId") UUID userId);

}
