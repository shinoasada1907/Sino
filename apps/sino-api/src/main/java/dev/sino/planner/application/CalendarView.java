package dev.sino.planner.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.EventTime;
import dev.sino.planner.domain.Recurrence;
import dev.sino.planner.domain.TaskStatus;

/**
 * The calendar of a user for the days [{@code from}, {@code to}): every occurrence of an appointment that meets them,
 * and the tasks due in them (spec {@code calendar}, D-86). Nothing here is stored: the occurrences of a repeating
 * appointment or task are worked out for the range.
 */
public record CalendarView(Instant generatedAt, LocalDate from, LocalDate to, List<EventOccurrence> events,
        List<TaskOccurrence> tasks) {

    /**
     * One occurrence of an appointment: {@code id} is {@code <eventId>@<start day>}, {@code time} is the time of this
     * occurrence, the other fields are the appointment's.
     */
    public record EventOccurrence(String id, CalendarEvent event, EventTime time) {
    }

    /**
     * A task with a due in the range, or an occurrence of a repeating task that is not made yet. A real task has its
     * own ID for {@code id}; a coming occurrence has {@code <taskId>@<due day>}, with the open task of its series as
     * {@code taskId}.
     */
    public record TaskOccurrence(String id, UUID taskId, String title, TaskStatus status, Due due, Instant completedAt,
            Recurrence recurrence) {
    }

}
