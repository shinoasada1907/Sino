package dev.sino.settings.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;
import static org.assertj.core.api.Assertions.assertThatNoException;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SettingsTests {

    private static final Settings D = Settings.DEFAULTS;

    private static Settings withMorning(LocalTime morningTime) {
        return new Settings(D.theme(), D.dateFormat(), D.motion(), D.notifications(), D.quietHours(), D.timeZone(),
                morningTime, D.defaultReminderMinutes(), D.weekStart());
    }

    private static Settings withReminder(Integer minutes) {
        return new Settings(D.theme(), D.dateFormat(), D.motion(), D.notifications(), D.quietHours(), D.timeZone(),
                D.morningTime(), minutes, D.weekStart());
    }

    private static Settings withZone(ZoneId zone) {
        return new Settings(D.theme(), D.dateFormat(), D.motion(), D.notifications(), D.quietHours(), zone,
                D.morningTime(), D.defaultReminderMinutes(), D.weekStart());
    }

    @Test
    void theDefaultsAreTheValuesOfTheCanvas() {
        assertThat(D.theme()).isEqualTo(Theme.SYSTEM);
        assertThat(D.dateFormat()).isEqualTo(DateFormat.DMY);
        assertThat(D.motion()).isEqualTo(Motion.FULL);
        assertThat(D.notifications()).isEqualTo(new Notifications(true, false, true, true, true, true));
        assertThat(D.quietHours()).isEqualTo(new QuietHours(LocalTime.of(22, 0), LocalTime.of(7, 0)));
        assertThat(D.timeZone()).isEqualTo(ZoneId.of("Asia/Ho_Chi_Minh"));
        assertThat(D.morningTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(D.defaultReminderMinutes()).isEqualTo(15);
        assertThat(D.weekStart()).isEqualTo(WeekStart.MONDAY);
    }

    @Test
    void theMorningIsFromFiveToTwelve() {
        assertThatNoException().isThrownBy(() -> withMorning(LocalTime.of(5, 0)));
        assertThatNoException().isThrownBy(() -> withMorning(LocalTime.of(12, 0)));
        assertThatIllegalArgumentException().isThrownBy(() -> withMorning(LocalTime.of(4, 59)));
        assertThatIllegalArgumentException().isThrownBy(() -> withMorning(LocalTime.of(12, 1)));
        assertThatIllegalArgumentException().isThrownBy(() -> withMorning(LocalTime.of(9, 0, 30)));
        assertThatNullPointerException().isThrownBy(() -> withMorning(null));
    }

    @ParameterizedTest
    @ValueSource(ints = { 5, 10, 15, 30, 60, 120, 1440 })
    void aReminderIsOneOfTheListedMinutes(int minutes) {
        assertThat(withReminder(minutes).defaultReminderMinutes()).isEqualTo(minutes);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 1, 7, 45, 1439, -15 })
    void anotherReminderIsRefused(int minutes) {
        assertThatIllegalArgumentException().isThrownBy(() -> withReminder(minutes));
    }

    @Test
    void noReminderAndNoQuietHoursAreAllowed() {
        Settings quiet = new Settings(D.theme(), D.dateFormat(), D.motion(), D.notifications(), null, D.timeZone(),
                D.morningTime(), null, D.weekStart());

        assertThat(quiet.quietHours()).isNull();
        assertThat(quiet.defaultReminderMinutes()).isNull();
    }

    @Test
    void quietHoursMayRunPastMidnightButNotStartWhereTheyEnd() {
        assertThatNoException().isThrownBy(() -> new QuietHours(LocalTime.of(23, 0), LocalTime.of(6, 0)));
        assertThatNoException().isThrownBy(() -> new QuietHours(LocalTime.of(12, 0), LocalTime.of(13, 30)));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new QuietHours(LocalTime.of(22, 0), LocalTime.of(22, 0)));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new QuietHours(LocalTime.of(22, 0, 1), LocalTime.of(7, 0)));
        assertThatNullPointerException().isThrownBy(() -> new QuietHours(LocalTime.of(22, 0), null));
    }

    @Test
    void theTimeZoneIsAnIanaId() {
        assertThat(withZone(ZoneId.of("Europe/Paris")).timeZone()).isEqualTo(ZoneId.of("Europe/Paris"));
        assertThat(withZone(ZoneId.of("UTC")).timeZone()).isEqualTo(ZoneId.of("UTC"));
        assertThatIllegalArgumentException().isThrownBy(() -> withZone(ZoneOffset.ofHours(7)));
        assertThatIllegalArgumentException().isThrownBy(() -> withZone(ZoneId.of("UTC+07:00")));
        assertThat(Settings.isKnownTimeZone("Asia/Hanoi_Not_A_Zone")).isFalse();
    }

    @Test
    void theRowKeepsEverySetting() {
        Settings changed = new Settings(Theme.DARK, DateFormat.LONG, Motion.REDUCED,
                new Notifications(false, true, false, true, false, true), null, ZoneId.of("America/New_York"),
                LocalTime.of(5, 30), null, WeekStart.SUNDAY);
        Instant now = Instant.parse("2026-10-21T03:00:00Z");

        UserSettings row = UserSettings.create(UUID.randomUUID(), D, now);
        row.replace(changed, now.plusSeconds(60));

        assertThat(row.settings()).isEqualTo(changed);
        assertThat(row.updatedAt()).isEqualTo(now.plusSeconds(60));
    }

}
