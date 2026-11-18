package dev.sino.planner.application;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.ReminderKind;
import dev.sino.planner.domain.ReminderOccurrence;
import dev.sino.planner.domain.ReminderState;
import dev.sino.planner.domain.ReminderTimes;
import dev.sino.planner.domain.Task;
import dev.sino.planner.infrastructure.ReminderDeliveries;

/**
 * The reminder of an appointment or a task as the API shows it (D-523): when the next one fires, its offset, and
 * whether that one has fired.
 */
@Service
public class ReminderViews {

    /** {@code at} is when the reminder of the next occurrence fires; {@code state} is {@code FIRED} once it did. */
    public record View(Instant at, int offsetMinutes, ReminderState state) {
    }

    private final ReminderDeliveries deliveries;
    private final PlannerProperties properties;
    private final Clock clock;

    ReminderViews(ReminderDeliveries deliveries, PlannerProperties properties, Clock clock) {
        this.deliveries = deliveries;
        this.properties = properties;
        this.clock = clock;
    }

    /** {@code null} when the appointment has no reminder. */
    @Transactional(readOnly = true)
    public View of(CalendarEvent event) {
        ReminderOccurrence next = ReminderTimes.next(event, properties.timeZone(), clock.instant());
        return next == null ? null : view(event.ownerId(), ReminderKind.EVENT, event.id(), next,
                event.reminder().offsetMinutes());
    }

    /** {@code null} when the task has no reminder. */
    @Transactional(readOnly = true)
    public View of(Task task) {
        ReminderOccurrence next = ReminderTimes.next(task, properties.timeZone());
        return next == null ? null : view(task.ownerId(), ReminderKind.TASK, task.id(), next,
                task.reminder().offsetMinutes());
    }

    private View view(UUID ownerId, ReminderKind kind, UUID itemId, ReminderOccurrence next,
            int offsetMinutes) {
        ReminderState state = deliveries.fired(ownerId, kind, itemId, next.date()) ? ReminderState.FIRED
                : ReminderState.PENDING;
        return new View(next.at(), offsetMinutes, state);
    }

}
