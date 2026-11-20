package dev.sino.settings.application;

import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.sino.settings.SettingsDirectory;

/** {@link SettingsDirectory} on top of {@link SettingsService}. */
@Service
class SettingsDirectoryService implements SettingsDirectory {

    private final SettingsService settings;

    SettingsDirectoryService(SettingsService settings) {
        this.settings = settings;
    }

    @Override
    public Optional<Integer> defaultReminderMinutes(UUID ownerId) {
        return Optional.ofNullable(settings.read(ownerId).defaultReminderMinutes());
    }

}
