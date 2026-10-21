package dev.sino.settings.infrastructure;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.sino.settings.domain.UserSettings;

/** The stored settings, one row per user, found by the user's ID. */
public interface UserSettingsRepository extends JpaRepository<UserSettings, UUID> {

}
