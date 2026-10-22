package dev.sino.settings.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.jdbc.JdbcTestUtils;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.settings.domain.DateFormat;
import dev.sino.settings.domain.Motion;
import dev.sino.settings.domain.Notifications;
import dev.sino.settings.domain.Settings;
import dev.sino.settings.domain.Theme;
import dev.sino.settings.domain.UserSettings;
import dev.sino.settings.domain.WeekStart;
import dev.sino.settings.infrastructure.UserSettingsRepository;

/**
 * The stored settings on a real PostgreSQL (V23). The annotations are those of the API tests, so the application context
 * and its database are shared with them.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class SettingsServiceTests {

    private static final String USER = "settings-user@example.com";
    private static final String OTHER = "settings-other@example.com";

    private static final Instant NOW = Instant.parse("2026-10-21T03:00:00Z");

    private static final Settings CHANGED = new Settings(Theme.LIGHT, DateFormat.ISO, Motion.OFF,
            new Notifications(true, true, false, false, true, false), null, ZoneId.of("Europe/Paris"),
            LocalTime.of(12, 0), null, WeekStart.SUNDAY);

    @Autowired
    private SettingsService service;

    @Autowired
    private UserSettingsRepository rows;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID user;

    @BeforeEach
    void startFromNoSettings() {
        removeTheUsersOfThisClass();
        jdbc.update("delete from user_settings");
        user = users.save(new AppUser(USER, "Settings")).id();
    }

    @AfterEach
    void removeTheUsersOfThisClass() {
        jdbc.update("delete from app_user where email in (?, ?)", USER, OTHER);
    }

    @Test
    void aUserWhoChangedNothingReadsTheDefaultsAndNothingIsWritten() {
        assertThat(service.read(user)).isEqualTo(Settings.DEFAULTS);

        assertThat(JdbcTestUtils.countRowsInTable(jdbc, "user_settings")).isZero();
    }

    @Test
    void storedSettingsReadBackAsTheyWereKept() {
        rows.save(UserSettings.create(user, CHANGED, NOW));

        assertThat(service.read(user)).isEqualTo(CHANGED);
    }

    @Test
    void aUserReadsOnlyTheirOwnSettings() {
        UUID other = users.save(new AppUser(OTHER, "Other")).id();
        rows.save(UserSettings.create(other, CHANGED, NOW));

        assertThat(service.read(user)).isEqualTo(Settings.DEFAULTS);
    }

    @Test
    void theSettingsGoWithTheirUser() {
        rows.save(UserSettings.create(user, CHANGED, NOW));

        jdbc.update("delete from app_user where id = ?", user);

        assertThat(JdbcTestUtils.countRowsInTable(jdbc, "user_settings")).isZero();
    }

    @Test
    void thereAreNoSettingsWithoutAUser() {
        assertThatThrownBy(() -> rows.saveAndFlush(UserSettings.create(UUID.randomUUID(), CHANGED, NOW)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

}
