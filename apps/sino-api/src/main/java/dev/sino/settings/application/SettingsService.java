package dev.sino.settings.application;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.settings.domain.Settings;
import dev.sino.settings.domain.SettingsChange;
import dev.sino.settings.domain.UserSettings;
import dev.sino.settings.infrastructure.UserSettingsRepository;

/**
 * The settings of a user (spec {@code user-settings}). Every method takes the owner from the web layer, so a user only
 * ever reads and changes their own.
 * <p>
 * Two changes at once lose nothing (D-402): each one locks the user's row before it reads it, so the second waits for
 * the first to commit and then builds on what it wrote. A user's first change makes the row; when two first changes
 * meet, both find no row and both insert it, the primary key lets one in, and the other is caught outside the
 * transaction that failed and made again in a new one, which then finds the row and locks it (as D-343 does for
 * stickers).
 */
@Service
public class SettingsService {

    private final UserSettingsRepository rows;
    private final Clock clock;
    private final TransactionTemplate transaction;

    SettingsService(UserSettingsRepository rows, Clock clock, PlatformTransactionManager transactionManager) {
        this.rows = rows;
        this.clock = clock;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /** The settings of the user: the defaults while the user has changed nothing, and then nothing is written (D-402). */
    @Transactional(readOnly = true)
    public Settings read(UUID ownerId) {
        return rows.findById(ownerId).map(UserSettings::settings).orElse(Settings.DEFAULTS);
    }

    /**
     * Puts in place what {@code change} sets and returns the whole settings. A change that sets nothing writes nothing.
     *
     * @throws IllegalArgumentException when the result would break a rule of {@link Settings}; nothing is written
     */
    public Settings change(UUID ownerId, SettingsChange change) {
        if (change.isEmpty()) {
            return read(ownerId);
        }
        try {
            return transaction.execute(status -> changeLocked(ownerId, change));
        } catch (DataIntegrityViolationException firstChangesMet) {
            return transaction.execute(status -> changeLocked(ownerId, change));
        }
    }

    private Settings changeLocked(UUID ownerId, SettingsChange change) {
        Optional<UserSettings> stored = rows.findForUpdate(ownerId);
        if (stored.isPresent()) {
            Settings changed = stored.get().settings().with(change);
            stored.get().replace(changed, clock.instant());
            return changed;
        }
        Settings changed = Settings.DEFAULTS.with(change);
        // Flushed here so that a row inserted by a change at the same moment is refused inside this transaction.
        rows.saveAndFlush(UserSettings.create(ownerId, changed, clock.instant()));
        return changed;
    }

}
