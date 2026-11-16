package dev.sino.planner.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import dev.sino.planner.application.CalendarView;
import dev.sino.planner.application.CalendarView.EventOccurrence;
import dev.sino.planner.application.CalendarView.TaskOccurrence;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.EventTime;

/**
 * {@code GET /api/calendar} as the web's {@code CalendarData} (data contract of {@code fe-ui-calendar}), without
 * {@code providers}, which the web reads from {@code GET /api/providers}. {@code reminders} is empty for now (D-150).
 */
record CalendarResponse(Instant generatedAt, LocalDate from, LocalDate to, List<Event> events, List<Task> tasks,
        List<Object> reminders) {

    static CalendarResponse from(CalendarView view) {
        return new CalendarResponse(view.generatedAt(), view.from(), view.to(),
                view.events().stream().map(Event::from).toList(), view.tasks().stream().map(Task::from).toList(),
                List.of());
    }

    /** One occurrence of an appointment; {@code id} is {@code <eventId>@<start day>}. */
    record Event(String id, UUID eventId, String title, Instant startsAt, Instant endsAt, LocalDate startDate,
            LocalDate endDate, String location, String notes, Object reminder, RepeatBody recurrence, Object source,
            Object related) {

        static Event from(EventOccurrence occurrence) {
            CalendarEvent event = occurrence.event();
            EventTime time = occurrence.time();
            return new Event(occurrence.id(), event.id(), event.title(), time.startsAt(), time.endsAt(),
                    time.startDate(), time.endDate(), event.location(), event.notes(), null,
                    RepeatBody.from(event.recurrence()), null, null);
        }

    }

    /** A task with a due in the range, or a coming occurrence of a repeating one ({@code id} is {@code <taskId>@<day>}). */
    record Task(String id, UUID taskId, String title, String status, Instant dueAt, LocalDate dueDate,
            Instant completedAt, RepeatBody recurrence, Object source) {

        static Task from(TaskOccurrence occurrence) {
            Due due = occurrence.due();
            return new Task(occurrence.id(), occurrence.taskId(), occurrence.title(), occurrence.status().name(),
                    due.at(), due.date(), occurrence.completedAt(), RepeatBody.from(occurrence.recurrence()), null);
        }

    }

}
