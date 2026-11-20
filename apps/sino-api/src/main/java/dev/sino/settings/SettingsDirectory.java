package dev.sino.settings;

import java.util.Optional;
import java.util.UUID;

/**
 * How another module reads the settings of a user. Read only; the tables of this module stay its own.
 */
public interface SettingsDirectory {

    /** The default reminder of the user in minutes before the start (spec {@code user-settings}); empty when it is off. */
    Optional<Integer> defaultReminderMinutes(UUID ownerId);

}
