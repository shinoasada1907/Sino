package dev.sino.planner.application;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.common.error.SinoException;
import dev.sino.planner.application.reminder.ReminderChange;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.PlannerErrorCode;
import dev.sino.planner.domain.Recurrence;
import dev.sino.planner.domain.Reminder;
import dev.sino.planner.domain.ReminderKind;
import dev.sino.planner.infrastructure.CalendarEventRepository;
import dev.sino.settings.SettingsDirectory;

/**
 * The appointments of a user (spec {@code calendar}, F17): create, read, replace, delete. A repeating appointment is
 * one row, so reading, replacing and deleting always act on the whole series (D-151). Every method takes the owner from
 * the web layer; an appointment of another user is reported as not found.
 */
@Service
public class EventService {

    private final CalendarEventRepository events;
    private final PlannerProperties properties;
    private final SettingsDirectory settings;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    EventService(CalendarEventRepository events, PlannerProperties properties, SettingsDirectory settings,
            ApplicationEventPublisher publisher, Clock clock) {
        this.events = events;
        this.properties = properties;
        this.settings = settings;
        this.publisher = publisher;
        this.clock = clock;
    }

    /**
     * @throws SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not fit the start
     */
    @Transactional
    public CalendarEvent create(UUID ownerId, NewEvent draft) {
        Instant now = clock.instant();
        CalendarEvent event = CalendarEvent.create(ownerId, draft.title(), draft.location(), draft.notes(),
                draft.time(), ruleOf(draft.repeat()), now);
        event.changeReminder(reminderOf(ownerId, draft), now);
        CalendarEvent saved = events.save(event);
        remindersChanged(saved);
        return saved;
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
        Instant now = clock.instant();
        event.replace(draft.title(), draft.location(), draft.notes(), draft.time(), ruleOf(draft.repeat()), now);
        event.changeReminder(reminderOf(ownerId, draft), now);
        remindersChanged(event);
        return event;
    }

    /** Deletes the appointment and, when it repeats, every occurrence of it (D-151). */
    @Transactional
    public void delete(UUID ownerId, UUID id) {
        CalendarEvent event = owned(ownerId, id);
        events.delete(event);
        remindersChanged(event);
    }

    /** Tells the reminder code, which acts once this transaction has committed (D-522). */
    private void remindersChanged(CalendarEvent event) {
        publisher.publishEvent(new ReminderChange(ReminderKind.EVENT, event.id(), event.reminderRev()));
    }

    /**
     * The reminder to keep: the one given, or for a new timed appointment that left it out the default of the user's
     * settings when it is one a timed appointment allows (D-523); otherwise none.
     */
    private Reminder reminderOf(UUID ownerId, NewEvent draft) {
        if (draft.reminder() != null || !draft.useDefaultReminder() || draft.time().isWholeDays()) {
            return draft.reminder();
        }
        return settings.defaultReminderMinutes(ownerId).filter(minutes -> Reminder.isAllowed(minutes, false))
                .map(Reminder::new).orElse(null);
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
