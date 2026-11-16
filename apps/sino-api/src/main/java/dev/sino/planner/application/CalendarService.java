package dev.sino.planner.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.planner.application.CalendarView.EventOccurrence;
import dev.sino.planner.application.CalendarView.TaskOccurrence;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.EventTime;
import dev.sino.planner.domain.Occurrence;
import dev.sino.planner.domain.Recurrence;
import dev.sino.planner.domain.RecurrenceCalculator;
import dev.sino.planner.domain.Task;
import dev.sino.planner.infrastructure.CalendarEventRepository;
import dev.sino.planner.infrastructure.TaskRepository;

/**
 * The calendar of a user for a range of days (spec {@code calendar}, F17, design Backend 6): one request, every
 * occurrence that meets the range. The days of the range are days of Sino's time zone ({@code sino.planner.time-zone},
 * D-155); a repeat rule is worked out in the zone it was made in.
 * <p>
 * The range is at most {@value #MAX_DAYS} days and inside the years 1900 to 2200: the first bound keeps the number of
 * occurrences of one request small, the second keeps the date arithmetic of the calculator from overflowing.
 */
@Service
public class CalendarService {

    public static final int MAX_DAYS = 62;

    /** The earliest {@code from}, and the latest {@code to} (not included): the years 1900 to 2200. */
    public static final LocalDate EARLIEST = EventTime.EARLIEST;
    public static final LocalDate LATEST = EventTime.LATEST;

    /** An appointment lasts at most this long, so one that began earlier than this before the range cannot reach it. */
    private static final Duration LONGEST_EVENT = Duration.ofDays(EventTime.MAX_DAYS);

    private final CalendarEventRepository events;
    private final TaskRepository tasks;
    private final PlannerProperties properties;
    private final Clock clock;

    CalendarService(CalendarEventRepository events, TaskRepository tasks, PlannerProperties properties, Clock clock) {
        this.events = events;
        this.tasks = tasks;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * @param from first day, included
     * @param to   last day, not included; after {@code from}, at most {@value #MAX_DAYS} days later
     * @throws IllegalArgumentException when the range is not one the API lets in
     */
    @Transactional(readOnly = true)
    public CalendarView view(UUID ownerId, LocalDate from, LocalDate to) {
        if (!to.isAfter(from) || ChronoUnit.DAYS.between(from, to) > MAX_DAYS || from.isBefore(EARLIEST)
                || to.isAfter(LATEST)) {
            throw new IllegalArgumentException("not a supported range of days: " + from + " to " + to);
        }
        ZoneId zone = properties.timeZone();
        Instant now = clock.instant();
        Range range = new Range(from, to, from.atStartOfDay(zone).toInstant(), to.atStartOfDay(zone).toInstant());

        List<EventOccurrence> eventItems = new ArrayList<>();
        events.findSingleOverlapping(ownerId, range.fromAt(), range.toAt(), from, to)
                .forEach(event -> eventItems.add(new EventOccurrence(
                        event.id() + "@" + event.time().startDay(zone), event, event.time())));
        events.findRepeatingStartedBefore(ownerId, range.toAt(), to)
                .forEach(event -> eventItems.addAll(occurrencesOf(event, range)));
        eventItems.sort(Comparator.comparing((EventOccurrence e) -> startOf(e.time(), zone))
                .thenComparing(e -> e.event().title()).thenComparing(EventOccurrence::id));

        List<TaskOccurrence> taskItems = new ArrayList<>();
        tasks.findDueBetween(ownerId, range.fromAt(), range.toAt(), from, to)
                .forEach(task -> taskItems.add(real(task)));
        if (!LocalDate.ofInstant(now, zone).isBefore(from) && LocalDate.ofInstant(now, zone).isBefore(to)) {
            tasks.findOpenDueBefore(ownerId, range.fromAt(), from).forEach(task -> taskItems.add(real(task)));
        }
        tasks.findOpenRepeating(ownerId).forEach(task -> taskItems.addAll(comingOccurrencesOf(task, range, now)));
        taskItems.sort(Comparator.comparing((TaskOccurrence t) -> dueStart(t.due(), zone))
                .thenComparing(TaskOccurrence::title).thenComparing(TaskOccurrence::id));

        return new CalendarView(now, from, to, eventItems, taskItems);
    }

    /** The occurrences of a repeating appointment that meet the range; the appointment itself is the first one. */
    private List<EventOccurrence> occurrencesOf(CalendarEvent event, Range range) {
        Recurrence rule = event.recurrence();
        ZoneId zone = rule.timeZone();
        EventTime first = event.time();
        // An occurrence that meets the range starts at most 14 days before it, and before its end.
        LocalDate searchFrom = first.isWholeDays() ? range.from().minusDays(EventTime.MAX_DAYS)
                : LocalDate.ofInstant(range.fromAt().minus(LONGEST_EVENT), zone);
        LocalDate searchTo = first.isWholeDays() ? range.to() : LocalDate.ofInstant(range.toAt(), zone).plusDays(1);

        List<EventOccurrence> found = new ArrayList<>();
        for (Occurrence occurrence : RecurrenceCalculator.between(rule,
                new Occurrence(0, first.startDay(zone)), searchFrom, searchTo)) {
            EventTime time = first.isWholeDays()
                    ? EventTime.wholeDays(occurrence.date(), occurrence.date().plusDays(
                            ChronoUnit.DAYS.between(first.startDate(), first.endDate())))
                    : timedOn(first, rule, occurrence.date());
            if (meets(time, range)) {
                found.add(new EventOccurrence(event.id() + "@" + occurrence.date(), event, time));
            }
        }
        return found;
    }

    /** The first occurrence's time moved to {@code day}: same local start, same length. */
    private static EventTime timedOn(EventTime first, Recurrence rule, LocalDate day) {
        Instant start = rule.instantAt(day, LocalTime.ofInstant(first.startsAt(), rule.timeZone()));
        return EventTime.timed(start, start.plus(Duration.between(first.startsAt(), first.endsAt())));
    }

    private static boolean meets(EventTime time, Range range) {
        return time.isWholeDays()
                ? time.startDate().isBefore(range.to()) && time.endDate().isAfter(range.from())
                : time.startsAt().isBefore(range.toAt()) && time.endsAt().isAfter(range.fromAt());
    }

    private static TaskOccurrence real(Task task) {
        return new TaskOccurrence(task.id().toString(), task.id(), task.title(), task.status(), task.due(),
                task.completedAt(), task.recurrence());
    }

    /**
     * The occurrences of an open repeating task after its own due that are not made yet, in the range, not before
     * today and within the rule's count and end. A task that has made its next occurrence has none: the next one is a
     * task of its own, which stands for the ones after it (D-159).
     */
    private List<TaskOccurrence> comingOccurrencesOf(Task task, Range range, Instant now) {
        if (task.nextCreated()) {
            return List.of();
        }
        Recurrence rule = task.recurrence();
        ZoneId zone = rule.timeZone();
        Due due = task.due();
        LocalDate today = LocalDate.ofInstant(now, zone);
        LocalDate searchFrom = due.date() != null ? range.from() : LocalDate.ofInstant(range.fromAt(), zone);
        LocalDate searchTo = due.date() != null ? range.to() : LocalDate.ofInstant(range.toAt(), zone).plusDays(1);
        if (today.isAfter(searchFrom)) {
            searchFrom = today;
        }

        List<TaskOccurrence> found = new ArrayList<>();
        for (Occurrence occurrence : RecurrenceCalculator.between(rule,
                new Occurrence(task.occurrenceIndex(), due.day(zone)), searchFrom, searchTo)) {
            if (occurrence.index() == task.occurrenceIndex()) {
                continue;
            }
            Due comingDue = due.date() != null ? Due.on(occurrence.date())
                    : Due.at(rule.instantAt(occurrence.date(), LocalTime.ofInstant(due.at(), zone)));
            if (comingDue.at() != null
                    && (comingDue.at().isBefore(range.fromAt()) || !comingDue.at().isBefore(range.toAt()))) {
                continue;
            }
            found.add(new TaskOccurrence(task.id() + "@" + occurrence.date(), task.id(), task.title(), task.status(),
                    comingDue, null, rule));
        }
        return found;
    }

    private static Instant startOf(EventTime time, ZoneId zone) {
        return time.isWholeDays() ? time.startDate().atStartOfDay(zone).toInstant() : time.startsAt();
    }

    private static Instant dueStart(Due due, ZoneId zone) {
        return due.at() != null ? due.at() : due.date().atStartOfDay(zone).toInstant();
    }

    /** The range as days and as the moments those days start in Sino's zone. */
    private record Range(LocalDate from, LocalDate to, Instant fromAt, Instant toAt) {
    }

}
