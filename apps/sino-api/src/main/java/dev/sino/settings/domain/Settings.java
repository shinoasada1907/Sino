package dev.sino.settings.domain;

import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;

/**
 * The settings of a Sino user (D-401). {@code quietHours} and {@code defaultReminderMinutes} are {@code null} when they
 * are off; every other part is always set. The API checks every value first; here the rules guard the invariants, so
 * a caller that is not the REST layer cannot keep what the database would refuse.
 */
public record Settings(Theme theme, DateFormat dateFormat, Motion motion, Notifications notifications,
        QuietHours quietHours, ZoneId timeZone, LocalTime morningTime, Integer defaultReminderMinutes,
        WeekStart weekStart) {

    public static final LocalTime EARLIEST_MORNING = LocalTime.of(5, 0);
    public static final LocalTime LATEST_MORNING = LocalTime.of(12, 0);
    public static final List<Integer> REMINDER_MINUTES = List.of(5, 10, 15, 30, 60, 120, 1440);

    /** What a user who has changed nothing has: the values of the canvas. */
    public static final Settings DEFAULTS = new Settings(Theme.SYSTEM, DateFormat.DMY, Motion.FULL,
            Notifications.DEFAULTS, new QuietHours(LocalTime.of(22, 0), LocalTime.of(7, 0)),
            ZoneId.of("Asia/Ho_Chi_Minh"), LocalTime.of(9, 0), 15, WeekStart.MONDAY);

    public Settings {
        Objects.requireNonNull(theme, "theme");
        Objects.requireNonNull(dateFormat, "dateFormat");
        Objects.requireNonNull(motion, "motion");
        Objects.requireNonNull(notifications, "notifications");
        Objects.requireNonNull(timeZone, "timeZone");
        Objects.requireNonNull(weekStart, "weekStart");
        if (!isKnownTimeZone(timeZone.getId())) {
            throw new IllegalArgumentException("timeZone must be an IANA time zone ID");
        }
        QuietHours.requireWholeMinute(morningTime, "morningTime");
        if (morningTime.isBefore(EARLIEST_MORNING) || morningTime.isAfter(LATEST_MORNING)) {
            throw new IllegalArgumentException("morningTime must be from 05:00 to 12:00");
        }
        if (defaultReminderMinutes != null && !REMINDER_MINUTES.contains(defaultReminderMinutes)) {
            throw new IllegalArgumentException("defaultReminderMinutes must be one of " + REMINDER_MINUTES);
        }
    }

    /** These settings with the parts {@code change} sets put in place; the rules hold for the result too. */
    public Settings with(SettingsChange change) {
        return new Settings(
                change.theme() != null ? change.theme() : theme,
                change.dateFormat() != null ? change.dateFormat() : dateFormat,
                change.motion() != null ? change.motion() : motion,
                change.notifications() != null ? change.notifications().applyTo(notifications) : notifications,
                change.quietHours() != null ? change.quietHours().orElse(null) : quietHours,
                change.timeZone() != null ? change.timeZone() : timeZone,
                change.morningTime() != null ? change.morningTime() : morningTime,
                change.defaultReminderMinutes() != null ? change.defaultReminderMinutes().orElse(null)
                        : defaultReminderMinutes,
                change.weekStart() != null ? change.weekStart() : weekStart);
    }

    /**
     * Whether {@code id} names a time zone of the IANA database that {@code java.time} knows, such as
     * {@code Asia/Ho_Chi_Minh}; an offset such as {@code +07:00} is not one.
     */
    public static boolean isKnownTimeZone(String id) {
        return ZoneId.getAvailableZoneIds().contains(id);
    }

}
