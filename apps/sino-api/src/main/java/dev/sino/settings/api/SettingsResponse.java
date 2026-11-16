package dev.sino.settings.api;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

import dev.sino.settings.domain.Corners;
import dev.sino.settings.domain.DateFormat;
import dev.sino.settings.domain.LightBackground;
import dev.sino.settings.domain.Motion;
import dev.sino.settings.domain.Notifications;
import dev.sino.settings.domain.Palette;
import dev.sino.settings.domain.QuietHours;
import dev.sino.settings.domain.Settings;
import dev.sino.settings.domain.TextTone;
import dev.sino.settings.domain.Theme;
import dev.sino.settings.domain.WeekStart;

/**
 * The whole settings of the user as D-401 writes them: times as {@code HH:mm}, the time zone as its IANA ID,
 * {@code quietHours}, {@code defaultReminderMinutes} and {@code accentColor} {@code null} when they are off.
 */
record SettingsResponse(Theme theme, DateFormat dateFormat, Motion motion, Notifications notifications,
        QuietHoursBody quietHours, String timeZone, String morningTime, Integer defaultReminderMinutes,
        WeekStart weekStart, Palette palette, String accentColor, Corners corners, boolean decorations,
        TextTone textTone, LightBackground lightBackground) {

    static final DateTimeFormatter HOURS_AND_MINUTES = DateTimeFormatter.ofPattern("HH:mm");

    static SettingsResponse from(Settings settings) {
        QuietHours quietHours = settings.quietHours();
        return new SettingsResponse(settings.theme(), settings.dateFormat(), settings.motion(),
                settings.notifications(),
                quietHours == null ? null : new QuietHoursBody(text(quietHours.start()), text(quietHours.end())),
                settings.timeZone().getId(), text(settings.morningTime()), settings.defaultReminderMinutes(),
                settings.weekStart(), settings.palette(), settings.accentColor(), settings.corners(),
                settings.decorations(), settings.textTone(), settings.lightBackground());
    }

    private static String text(LocalTime time) {
        return HOURS_AND_MINUTES.format(time);
    }

    record QuietHoursBody(String start, String end) {
    }

}
