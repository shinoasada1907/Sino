package dev.sino.planner.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.EventTime;

/**
 * One appointment, the whole series when it repeats: its first occurrence and its rule. The web's edit form reads it.
 * The time is timed ({@code startsAt}, {@code endsAt}) or whole days ({@code startDate}, {@code endDate}, the end not
 * included). {@code reminder}, {@code source} and {@code related} are always {@code null} for now (D-150).
 */
record EventResponse(UUID id, String title, Instant startsAt, Instant endsAt, LocalDate startDate, LocalDate endDate,
        String location, String notes, Object reminder, RepeatBody recurrence, Object source, Object related,
        Instant createdAt, Instant updatedAt) {

    static EventResponse from(CalendarEvent event) {
        EventTime time = event.time();
        return new EventResponse(event.id(), event.title(), time.startsAt(), time.endsAt(), time.startDate(),
                time.endDate(), event.location(), event.notes(), null, RepeatBody.from(event.recurrence()), null, null,
                event.createdAt(), event.updatedAt());
    }

}
