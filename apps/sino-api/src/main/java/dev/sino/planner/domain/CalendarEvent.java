package dev.sino.planner.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import org.hibernate.annotations.UuidGenerator;

/**
 * An appointment of a Sino user (spec {@code calendar}, F17): a title, a time, maybe a place, notes and a repeat rule,
 * kept in Sino only (no invitation goes to anyone). A repeating appointment is one row for the whole series, its first
 * occurrence being the anchor; the occurrences are worked out when the calendar is read, and editing or deleting it
 * applies to all of them (D-151). Mapped onto table {@code calendar_event} (V27); the name avoids {@code event},
 * which Spring Modulith and the {@code realtime} module already use for other things.
 * <p>
 * The limits are checked by the API first; here they guard the invariants. "Now" comes from the caller's
 * {@code Clock}.
 */
@Entity
@Table(name = "calendar_event")
public class CalendarEvent {

    public static final int MAX_TITLE_LENGTH = 200;
    public static final int MAX_LOCATION_LENGTH = 200;
    public static final int MAX_NOTES_LENGTH = 20_000;

    @Id
    @UuidGenerator(style = UuidGenerator.Style.VERSION_7)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "location")
    private String location;

    @Column(name = "notes")
    private String notes;

    @Column(name = "starts_at")
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Embedded
    private Recurrence recurrence;

    @Column(name = "reminder_offset_minutes")
    private Integer reminderOffsetMinutes;

    @Column(name = "reminder_rev", nullable = false)
    private int reminderRev;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected CalendarEvent() {
    }

    /**
     * A new appointment.
     *
     * @throws dev.sino.common.error.SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not
     *         fit the start
     */
    public static CalendarEvent create(UUID ownerId, String title, String location, String notes, EventTime time,
            Recurrence recurrence, Instant now) {
        CalendarEvent event = new CalendarEvent();
        event.ownerId = Objects.requireNonNull(ownerId, "ownerId");
        event.createdAt = now;
        event.replace(title, location, notes, time, recurrence, now);
        return event;
    }

    /**
     * Replaces everything the user edits (D-153); for a repeating appointment that is the whole series, so past
     * occurrences change too (D-151). The rule is checked against the new start, so no appointment holds a rule that
     * does not fit it; nothing changes when it does not.
     *
     * @throws dev.sino.common.error.SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not
     *         fit the start
     */
    public void replace(String title, String location, String notes, EventTime time, Recurrence recurrence,
            Instant now) {
        Recurrence anchored = recurrence == null ? null : recurrence.anchoredAt(time.startDay(recurrence.timeZone()));
        this.title = checkedTitle(title);
        this.location = checkedLocation(location);
        this.notes = checkedNotes(notes);
        this.startsAt = time.startsAt();
        this.endsAt = time.endsAt();
        this.startDate = time.startDate();
        this.endDate = time.endDate();
        this.recurrence = anchored;
        if (reminderOffsetMinutes != null && !Reminder.isAllowed(reminderOffsetMinutes, time.isWholeDays())) {
            reminderOffsetMinutes = null;
        }
        this.updatedAt = now;
    }

    private static String checkedTitle(String title) {
        String trimmed = Objects.requireNonNull(title, "title").strip();
        if (trimmed.isEmpty() || trimmed.length() > MAX_TITLE_LENGTH) {
            throw new IllegalArgumentException("a title has 1 to " + MAX_TITLE_LENGTH + " characters");
        }
        return trimmed;
    }

    /** A blank location is no location. */
    private static String checkedLocation(String location) {
        if (location == null || location.isBlank()) {
            return null;
        }
        String trimmed = location.strip();
        if (trimmed.length() > MAX_LOCATION_LENGTH) {
            throw new IllegalArgumentException("a location has at most " + MAX_LOCATION_LENGTH + " characters");
        }
        return trimmed;
    }

    /** Blank notes are no notes. */
    private static String checkedNotes(String notes) {
        if (notes == null || notes.isBlank()) {
            return null;
        }
        if (notes.length() > MAX_NOTES_LENGTH) {
            throw new IllegalArgumentException("notes have at most " + MAX_NOTES_LENGTH + " characters");
        }
        return notes;
    }

    public UUID id() {
        return id;
    }

    public UUID ownerId() {
        return ownerId;
    }

    public String title() {
        return title;
    }

    public String location() {
        return location;
    }

    public String notes() {
        return notes;
    }

    public EventTime time() {
        return new EventTime(startsAt, endsAt, startDate, endDate);
    }

    /** {@code null} when the appointment does not repeat. */
    public Recurrence recurrence() {
        return recurrence;
    }

    /** {@code null} when the appointment has no reminder (D-523). */
    public Reminder reminder() {
        return reminderOffsetMinutes == null ? null : new Reminder(reminderOffsetMinutes);
    }

    /**
     * Sets or removes the reminder (D-523).
     *
     * @throws IllegalArgumentException when the offset does not fit the kind of time of the appointment
     */
    public void changeReminder(Reminder reminder, Instant now) {
        if (reminder != null && !Reminder.isAllowed(reminder.offsetMinutes(), time().isWholeDays())) {
            throw new IllegalArgumentException("this reminder does not fit the time of the appointment");
        }
        this.reminderOffsetMinutes = reminder == null ? null : reminder.offsetMinutes();
        this.updatedAt = now;
    }

    /** The revision of the background job of this appointment (D-522). */
    public int reminderRev() {
        return reminderRev;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant updatedAt() {
        return updatedAt;
    }

}
