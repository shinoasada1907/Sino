package dev.sino.planner.application;

import java.time.Clock;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.common.error.SinoException;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.PlannerErrorCode;
import dev.sino.planner.domain.Recurrence;
import dev.sino.planner.infrastructure.CalendarEventRepository;

/**
 * The appointments of a user (spec {@code calendar}, F17): create, read, replace, delete. A repeating appointment is
 * one row, so reading, replacing and deleting always act on the whole series (D-151). Every method takes the owner from
 * the web layer; an appointment of another user is reported as not found.
 */
@Service
public class EventService {

    private final CalendarEventRepository events;
    private final PlannerProperties properties;
    private final Clock clock;

    EventService(CalendarEventRepository events, PlannerProperties properties, Clock clock) {
        this.events = events;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * @throws SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not fit the start
     */
    @Transactional
    public CalendarEvent create(UUID ownerId, NewEvent draft) {
        return events.save(CalendarEvent.create(ownerId, draft.title(), draft.location(), draft.notes(),
                draft.time(), ruleOf(draft.repeat()), clock.instant()));
    }

    @Transactional(readOnly = true)
    public CalendarEvent get(UUID ownerId, UUID id) {
        return owned(ownerId, id);
    }

    /**
     * Replaces the whole appointment, the series included (D-151, D-153).
     *
     * @throws SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not fit the start
     */
    @Transactional
    public CalendarEvent replace(UUID ownerId, UUID id, NewEvent draft) {
        CalendarEvent event = owned(ownerId, id);
        event.replace(draft.title(), draft.location(), draft.notes(), draft.time(), ruleOf(draft.repeat()),
                clock.instant());
        return event;
    }

    /** Deletes the appointment and, when it repeats, every occurrence of it (D-151). */
    @Transactional
    public void delete(UUID ownerId, UUID id) {
        events.delete(owned(ownerId, id));
    }

    private CalendarEvent owned(UUID ownerId, UUID id) {
        return events.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new SinoException(PlannerErrorCode.EVENT_NOT_FOUND, "Appointment not found."));
    }

    /** The client's rule in Sino's time zone (D-157); the appointment checks it against its start. */
    private Recurrence ruleOf(RepeatRule repeat) {
        return repeat == null ? null : repeat.in(properties.timeZone());
    }

}
