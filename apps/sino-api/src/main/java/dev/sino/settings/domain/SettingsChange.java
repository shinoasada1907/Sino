package dev.sino.settings.domain;

import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;

/**
 * What one change of the settings sets (D-402); a {@code null} part stays as it is, and {@code notifications} changes
 * only the switches it names. {@code quietHours} and {@code defaultReminderMinutes} can also be turned off, so they are
 * an {@link Optional}: {@code null} keeps them, an empty one turns them off.
 */
public record SettingsChange(Theme theme, DateFormat dateFormat, Motion motion, NotificationsChange notifications,
        Optional<QuietHours> quietHours, ZoneId timeZone, LocalTime morningTime,
        Optional<Integer> defaultReminderMinutes, WeekStart weekStart) {

    public static final SettingsChange NONE = new SettingsChange(null, null, null, null, null, null, null, null, null);

    /** Whether the change sets nothing at all, as {@code {}} or {@code {"notifications": {}}} do. */
    public boolean isEmpty() {
        return theme == null && dateFormat == null && motion == null
                && (notifications == null || notifications.isEmpty()) && quietHours == null && timeZone == null
                && morningTime == null && defaultReminderMinutes == null && weekStart == null;
    }

}
