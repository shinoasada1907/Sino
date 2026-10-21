package dev.sino.settings.domain;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * The stored {@link Settings} of one user, mapped onto table {@code user_settings} (V23, D-404). The row is made by the
 * user's first change; until then the user has {@link Settings#DEFAULTS} and no row. Every setting is a column of its
 * own, so the database checks each value too. "Now" always comes from the caller.
 */
@Entity
@Table(name = "user_settings")
public class UserSettings {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "theme", nullable = false)
    private Theme theme;

    @Enumerated(EnumType.STRING)
    @Column(name = "date_format", nullable = false)
    private DateFormat dateFormat;

    @Enumerated(EnumType.STRING)
    @Column(name = "motion", nullable = false)
    private Motion motion;

    @Column(name = "notify_new_messages", nullable = false)
    private boolean notifyNewMessages;

    @Column(name = "notify_important_only", nullable = false)
    private boolean notifyImportantOnly;

    @Column(name = "notify_sync_errors", nullable = false)
    private boolean notifySyncErrors;

    @Column(name = "notify_new_registrations", nullable = false)
    private boolean notifyNewRegistrations;

    @Column(name = "notify_reminders", nullable = false)
    private boolean notifyReminders;

    @Column(name = "notify_scheduled_failed", nullable = false)
    private boolean notifyScheduledFailed;

    /** With {@link #quietHoursEnd}, {@code null} when there are no quiet hours. */
    @Column(name = "quiet_hours_start")
    private LocalTime quietHoursStart;

    @Column(name = "quiet_hours_end")
    private LocalTime quietHoursEnd;

    @Column(name = "time_zone", nullable = false)
    private String timeZone;

    @Column(name = "morning_time", nullable = false)
    private LocalTime morningTime;

    /** {@code null} is "no reminder". */
    @Column(name = "default_reminder_minutes")
    private Integer defaultReminderMinutes;

    @Enumerated(EnumType.STRING)
    @Column(name = "week_start", nullable = false)
    private WeekStart weekStart;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserSettings() {
    }

    public static UserSettings create(UUID userId, Settings settings, Instant now) {
        UserSettings row = new UserSettings();
        row.userId = Objects.requireNonNull(userId, "userId");
        row.replace(settings, now);
        return row;
    }

    public UUID userId() {
        return userId;
    }

    public Instant updatedAt() {
        return updatedAt;
    }

    public Settings settings() {
        return new Settings(theme, dateFormat, motion,
                new Notifications(notifyNewMessages, notifyImportantOnly, notifySyncErrors, notifyNewRegistrations,
                        notifyReminders, notifyScheduledFailed),
                quietHoursStart == null ? null : new QuietHours(quietHoursStart, quietHoursEnd),
                ZoneId.of(timeZone), morningTime, defaultReminderMinutes, weekStart);
    }

    /** Keeps {@code settings} in place of what the row held. */
    public void replace(Settings settings, Instant now) {
        Objects.requireNonNull(settings, "settings");
        theme = settings.theme();
        dateFormat = settings.dateFormat();
        motion = settings.motion();
        Notifications notifications = settings.notifications();
        notifyNewMessages = notifications.newMessages();
        notifyImportantOnly = notifications.importantOnly();
        notifySyncErrors = notifications.syncErrors();
        notifyNewRegistrations = notifications.newRegistrations();
        notifyReminders = notifications.reminders();
        notifyScheduledFailed = notifications.scheduledFailed();
        QuietHours quietHours = settings.quietHours();
        quietHoursStart = quietHours == null ? null : quietHours.start();
        quietHoursEnd = quietHours == null ? null : quietHours.end();
        timeZone = settings.timeZone().getId();
        morningTime = settings.morningTime();
        defaultReminderMinutes = settings.defaultReminderMinutes();
        weekStart = settings.weekStart();
        updatedAt = Objects.requireNonNull(now, "now");
    }

}
