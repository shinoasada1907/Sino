package dev.sino.settings.api;

import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import dev.sino.settings.domain.DateFormat;
import dev.sino.settings.domain.Motion;
import dev.sino.settings.domain.NotificationsChange;
import dev.sino.settings.domain.QuietHours;
import dev.sino.settings.domain.Settings;
import dev.sino.settings.domain.SettingsChange;
import dev.sino.settings.domain.Theme;
import dev.sino.settings.domain.WeekStart;

/**
 * Reads the JSON of {@code PATCH /api/settings} into a {@link SettingsChange} and lists, field by field, what breaks the
 * rules of D-401. The messages never repeat what the client sent.
 */
final class SettingsPatchReader {

    private static final Pattern HOURS_AND_MINUTES = Pattern.compile("([01]\\d|2[0-3]):[0-5]\\d");

    private static final String TIME = "must be a time written HH:mm";

    private SettingsPatchReader() {
    }

    /** {@code change} is only meaningful when {@code violations} is empty. */
    record Result(SettingsChange change, List<Violation> violations) {
    }

    /** One broken rule: {@code field} of the body, and {@code part} inside it ({@code null} for the field itself). */
    record Violation(String field, String part, String message) {
    }

    static Result read(ObjectNode body) {
        return new Reading().read(body);
    }

    /** The state of one reading: what the body sets so far, and what is wrong with it. */
    private static final class Reading {

        private final List<Violation> violations = new ArrayList<>();

        private Theme theme;
        private DateFormat dateFormat;
        private Motion motion;
        private NotificationsChange notifications;
        private Optional<QuietHours> quietHours;
        private ZoneId timeZone;
        private LocalTime morningTime;
        private Optional<Integer> defaultReminderMinutes;
        private WeekStart weekStart;

        Result read(ObjectNode body) {
            for (Map.Entry<String, JsonNode> field : body.properties()) {
                JsonNode value = field.getValue();
                switch (field.getKey()) {
                    case "theme" -> theme = choice("theme", value, Theme.class);
                    case "dateFormat" -> dateFormat = choice("dateFormat", value, DateFormat.class);
                    case "motion" -> motion = choice("motion", value, Motion.class);
                    case "notifications" -> notifications = notifications(value);
                    case "quietHours" -> quietHours = quietHours(value);
                    case "timeZone" -> timeZone = timeZone(value);
                    case "morningTime" -> morningTime = morningTime(value);
                    case "defaultReminderMinutes" -> defaultReminderMinutes = reminder(value);
                    case "weekStart" -> weekStart = choice("weekStart", value, WeekStart.class);
                    default -> refuse(field.getKey(), null, "is not a setting");
                }
            }
            SettingsChange change = new SettingsChange(theme, dateFormat, motion, notifications, quietHours, timeZone,
                    morningTime, defaultReminderMinutes, weekStart);
            return new Result(change, List.copyOf(violations));
        }

        private <E extends Enum<E>> E choice(String field, JsonNode value, Class<E> type) {
            if (value.isString()) {
                for (E constant : type.getEnumConstants()) {
                    if (constant.name().equals(value.stringValue())) {
                        return constant;
                    }
                }
            }
            String names = Arrays.stream(type.getEnumConstants()).map(Enum::name).collect(Collectors.joining(", "));
            return refuse(field, null, "must be one of " + names);
        }

        private NotificationsChange notifications(JsonNode value) {
            if (!value.isObject()) {
                return refuse("notifications", null, "must be an object of switches set to true or false");
            }
            Boolean newMessages = null;
            Boolean importantOnly = null;
            Boolean syncErrors = null;
            Boolean newRegistrations = null;
            Boolean reminders = null;
            Boolean scheduledFailed = null;
            for (Map.Entry<String, JsonNode> entry : value.properties()) {
                String name = entry.getKey();
                Boolean on = entry.getValue().isBoolean() ? entry.getValue().booleanValue() : null;
                switch (name) {
                    case "newMessages" -> newMessages = on;
                    case "importantOnly" -> importantOnly = on;
                    case "syncErrors" -> syncErrors = on;
                    case "newRegistrations" -> newRegistrations = on;
                    case "reminders" -> reminders = on;
                    case "scheduledFailed" -> scheduledFailed = on;
                    default -> {
                        refuse("notifications", name, "is not a notification switch");
                        continue;
                    }
                }
                if (on == null) {
                    refuse("notifications", name, "must be true or false");
                }
            }
            return new NotificationsChange(newMessages, importantOnly, syncErrors, newRegistrations, reminders,
                    scheduledFailed);
        }

        private Optional<QuietHours> quietHours(JsonNode value) {
            if (value.isNull()) {
                return Optional.empty();
            }
            if (!value.isObject()) {
                return refuse("quietHours", null, "must be {start, end} or null");
            }
            for (Map.Entry<String, JsonNode> entry : value.properties()) {
                if (!entry.getKey().equals("start") && !entry.getKey().equals("end")) {
                    refuse("quietHours", entry.getKey(), "is not a part of quiet hours");
                }
            }
            LocalTime start = time("quietHours", "start", value.get("start"));
            LocalTime end = time("quietHours", "end", value.get("end"));
            if (start == null || end == null) {
                return null;
            }
            if (start.equals(end)) {
                return refuse("quietHours", null, "must start and end at different times");
            }
            return Optional.of(new QuietHours(start, end));
        }

        private ZoneId timeZone(JsonNode value) {
            if (value.isString() && Settings.isKnownTimeZone(value.stringValue())) {
                return ZoneId.of(value.stringValue());
            }
            return refuse("timeZone", null, "must be an IANA time zone ID such as Asia/Ho_Chi_Minh");
        }

        private LocalTime morningTime(JsonNode value) {
            LocalTime time = time("morningTime", null, value);
            if (time != null && (time.isBefore(Settings.EARLIEST_MORNING) || time.isAfter(Settings.LATEST_MORNING))) {
                return refuse("morningTime", null, "must be from 05:00 to 12:00");
            }
            return time;
        }

        private Optional<Integer> reminder(JsonNode value) {
            if (value.isNull()) {
                return Optional.empty();
            }
            if (value.isInt() && Settings.REMINDER_MINUTES.contains(value.intValue())) {
                return Optional.of(value.intValue());
            }
            String minutes = Settings.REMINDER_MINUTES.stream().map(String::valueOf).collect(Collectors.joining(", "));
            return refuse("defaultReminderMinutes", null, "must be one of " + minutes + ", or null");
        }

        private LocalTime time(String field, String part, JsonNode value) {
            if (value != null && value.isString() && HOURS_AND_MINUTES.matcher(value.stringValue()).matches()) {
                return LocalTime.parse(value.stringValue());
            }
            return refuse(field, part, TIME);
        }

        /** Notes the broken rule and gives {@code null}, so that a reading goes on to list every error. */
        private <T> T refuse(String field, String part, String message) {
            violations.add(new Violation(field, part, message));
            return null;
        }

    }

}
