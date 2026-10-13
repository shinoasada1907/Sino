package dev.sino.planner.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import org.hibernate.annotations.UuidGenerator;

/**
 * A task of a Sino user (spec {@code tasks}, F16): a title, maybe notes, maybe a due and a repeat rule, open or done.
 * A repeating task is one occurrence of its series: when it is done, {@link #makeNextOccurrence} makes the next one
 * as a new task with the same title, notes and rule. Mapped onto table {@code task} (V18).
 * <p>
 * The title and notes limits are checked by the API first; here they guard the invariants. "Now" always comes from
 * the caller's {@code Clock}.
 */
@Entity
@Table(name = "task")
public class Task {

    public static final int MAX_TITLE_LENGTH = 200;
    public static final int MAX_NOTES_LENGTH = 20_000;

    @Id
    @UuidGenerator(style = UuidGenerator.Style.VERSION_7)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "notes")
    private String notes;

    @Column(name = "due_at")
    private Instant dueAt;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private TaskStatus status;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "series_id")
    private UUID seriesId;

    @Column(name = "occurrence_index", nullable = false)
    private int occurrenceIndex;

    @Column(name = "next_created", nullable = false)
    private boolean nextCreated;

    @Embedded
    private Recurrence recurrence;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Task() {
    }

    /**
     * A new open task; a repeating one starts its series.
     *
     * @throws dev.sino.common.error.SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not
     *         fit the due
     */
    public static Task create(UUID ownerId, String title, String notes, Due due, Recurrence recurrence, Instant now) {
        Task task = new Task();
        task.ownerId = Objects.requireNonNull(ownerId, "ownerId");
        task.title = checkedTitle(title);
        task.notes = checkedNotes(notes);
        task.setSchedule(due, recurrence);
        task.status = TaskStatus.OPEN;
        task.createdAt = now;
        task.updatedAt = now;
        return task;
    }

    public void rename(String title, Instant now) {
        this.title = checkedTitle(title);
        this.updatedAt = now;
    }

    /** Blank notes are no notes. */
    public void changeNotes(String notes, Instant now) {
        this.notes = checkedNotes(notes);
        this.updatedAt = now;
    }

    /**
     * Replaces the due and the rule together (D-153). A rule makes this task the first occurrence of its series, so
     * the count starts again from here; without a rule the task keeps its series, as a record, but repeats no more.
     *
     * @throws dev.sino.common.error.SinoException {@link PlannerErrorCode#INVALID_RECURRENCE} when the rule does not
     *         fit the due
     */
    public void reschedule(Due due, Recurrence recurrence, Instant now) {
        setSchedule(due, recurrence);
        if (recurrence != null) {
            occurrenceIndex = 0;
        }
        updatedAt = now;
    }

    /** @return {@code false} when the task was already done; nothing changes then */
    public boolean complete(Instant now) {
        if (status == TaskStatus.DONE) {
            return false;
        }
        status = TaskStatus.DONE;
        completedAt = now;
        updatedAt = now;
        return true;
    }

    /** @return {@code false} when the task was already open; nothing changes then */
    public boolean reopen(Instant now) {
        if (status == TaskStatus.OPEN) {
            return false;
        }
        status = TaskStatus.OPEN;
        completedAt = null;
        updatedAt = now;
        return true;
    }

    /**
     * Makes the next occurrence of a repeating task as a new open task, not yet stored: the first date of the rule
     * after this one that is not before today, today being taken in the rule's zone (spec {@code recurrence}). A due
     * moment keeps the local time of this task's due. A task makes its next occurrence once (D-159): done, opened
     * again and done again, it makes nothing. Empty also without a rule or when the rule has ended.
     * <p>
     * Known limit: when the local time does not exist on the next date (the gap of a daylight saving change, for
     * example 02:30 in Berlin on the last Sunday of March), {@link Recurrence#instantAt} moves it an hour later, and
     * the occurrences after that one keep the later time. Vietnam has no daylight saving.
     */
    public Optional<Task> makeNextOccurrence(Instant now) {
        if (recurrence == null || nextCreated) {
            return Optional.empty();
        }
        ZoneId zone = recurrence.timeZone();
        Occurrence current = new Occurrence(occurrenceIndex, due().day(zone));
        Optional<Task> next = RecurrenceCalculator.nextAfter(recurrence, current, LocalDate.ofInstant(now, zone))
                .map(occurrence -> occurrenceOn(occurrence, now));
        if (next.isPresent()) {
            nextCreated = true;
            updatedAt = now;
        }
        return next;
    }

    private Task occurrenceOn(Occurrence occurrence, Instant now) {
        Due nextDue = dueAt != null
                ? Due.at(recurrence.instantAt(occurrence.date(), LocalTime.ofInstant(dueAt, recurrence.timeZone())))
                : Due.on(occurrence.date());
        Task next = create(ownerId, title, notes, nextDue, recurrence, now);
        next.seriesId = seriesId;
        next.occurrenceIndex = occurrence.index();
        return next;
    }

    /**
     * Sets the due and the rule; the rule is checked against the due here, so no task holds a rule that does not fit
     * it. A rule given to a task without a series starts one. The series ID is random, not the task's ID, which only
     * exists once the task is saved.
     */
    private void setSchedule(Due due, Recurrence recurrence) {
        if (recurrence != null && due == null) {
            throw new IllegalArgumentException("only a task with a due repeats");
        }
        this.dueAt = due == null ? null : due.at();
        this.dueDate = due == null ? null : due.date();
        this.recurrence = recurrence == null ? null : recurrence.anchoredAt(due.day(recurrence.timeZone()));
        if (recurrence != null && seriesId == null) {
            seriesId = UUID.randomUUID();
        }
    }

    private static String checkedTitle(String title) {
        String trimmed = Objects.requireNonNull(title, "title").strip();
        if (trimmed.isEmpty() || trimmed.length() > MAX_TITLE_LENGTH) {
            throw new IllegalArgumentException("a title has 1 to " + MAX_TITLE_LENGTH + " characters");
        }
        return trimmed;
    }

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

    public String notes() {
        return notes;
    }

    /** {@code null} when the task has no due. */
    public Due due() {
        if (dueAt == null && dueDate == null) {
            return null;
        }
        return new Due(dueAt, dueDate);
    }

    public TaskStatus status() {
        return status;
    }

    public Instant completedAt() {
        return completedAt;
    }

    public UUID seriesId() {
        return seriesId;
    }

    public int occurrenceIndex() {
        return occurrenceIndex;
    }

    public Recurrence recurrence() {
        return recurrence;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant updatedAt() {
        return updatedAt;
    }

}
