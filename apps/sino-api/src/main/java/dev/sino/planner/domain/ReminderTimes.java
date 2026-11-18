package dev.sino.planner.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;

/**
 * Works out when the reminder of an appointment or a task fires (D-522). Nothing is stored: the answer comes from the
 * start, the repeat rule and the offset.
 */
public final class ReminderTimes {

    private ReminderTimes() {
    }

    /**
     * The next reminder of an appointment, {@code null} when it has none. A single appointment answers with its own
     * reminder even when that is past. A repeating one answers with the first occurrence whose reminder is not before
     * {@code now}; when the rule has ended, with its first occurrence (known limit: the last one would be truer, but
     * nothing needs it yet).
     *
     * @param planner the zone of the planner, for an appointment without a rule
     */
    public static ReminderOccurrence next(CalendarEvent event, ZoneId planner, Instant now) {
        Reminder reminder = event.reminder();
        if (reminder == null) {
            return null;
        }
        EventTime time = event.time();
        Recurrence rule = event.recurrence();
        ZoneId zone = rule == null ? planner : rule.timeZone();
        LocalDate first = time.startDay(zone);
        ReminderOccurrence own = time.isWholeDays() ? new ReminderOccurrence(first, reminder.firesBefore(first, zone))
                : new ReminderOccurrence(first, reminder.firesBefore(time.startsAt()));
        if (rule == null) {
            return own;
        }
        LocalTime timeOfDay = time.isWholeDays() ? null : LocalTime.ofInstant(time.startsAt(), zone);
        LocalDate today = LocalDate.ofInstant(now, zone);
        Occurrence anchor = new Occurrence(0, first);
        Optional<Occurrence> candidate = first.isBefore(today) ? RecurrenceCalculator.nextAfter(rule, anchor, today)
                : Optional.of(anchor);
        while (candidate.isPresent()) {
            LocalDate day = candidate.get().date();
            Instant at = timeOfDay == null ? reminder.firesBefore(day, zone)
                    : reminder.firesBefore(rule.instantAt(day, timeOfDay));
            if (!at.isBefore(now)) {
                return new ReminderOccurrence(day, at);
            }
            candidate = RecurrenceCalculator.nextAfter(rule, candidate.get(), day.plusDays(1));
        }
        return own;
    }

    /**
     * The reminder of a task, {@code null} when it has none. A task is one occurrence, so this is its own reminder,
     * past or not.
     */
    public static ReminderOccurrence next(Task task, ZoneId planner) {
        Reminder reminder = task.reminder();
        Due due = task.due();
        if (reminder == null || due == null) {
            return null;
        }
        ZoneId zone = task.recurrence() == null ? planner : task.recurrence().timeZone();
        LocalDate day = due.day(zone);
        Instant at = due.at() != null ? reminder.firesBefore(due.at()) : reminder.firesBefore(day, zone);
        return new ReminderOccurrence(day, at);
    }

}
