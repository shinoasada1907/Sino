package dev.sino.settings.application;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.settings.domain.Settings;
import dev.sino.settings.domain.UserSettings;
import dev.sino.settings.infrastructure.UserSettingsRepository;

/**
 * The settings of a user (spec {@code user-settings}). Every method takes the owner from the web layer, so a user only
 * ever reads and changes their own.
 */
@Service
public class SettingsService {

    private final UserSettingsRepository rows;

    SettingsService(UserSettingsRepository rows) {
        this.rows = rows;
    }

    /** The settings of the user: the defaults while the user has changed nothing, and then nothing is written (D-402). */
    @Transactional(readOnly = true)
    public Settings read(UUID ownerId) {
        return rows.findById(ownerId).map(UserSettings::settings).orElse(Settings.DEFAULTS);
    }

}
