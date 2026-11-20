package dev.sino.planner.application.reminder;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.UUID;

import org.jobrunr.jobs.annotations.Job;
import org.jobrunr.jobs.states.StateName;
import org.jobrunr.scheduling.BackgroundJob;
import org.jobrunr.storage.JobNotFoundException;
import org.jobrunr.storage.StorageProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.planner.application.PlannerProperties;
import dev.sino.planner.domain.ReminderKind;
import dev.sino.planner.domain.ReminderOccurrence;
import dev.sino.planner.domain.ReminderTimes;
import dev.sino.planner.domain.TaskStatus;
import dev.sino.planner.infrastructure.CalendarEventRepository;
import dev.sino.planner.infrastructure.TaskRepository;

/**
 * Keeps one background job for each appointment and task that has a reminder: booked at the reminder time of the next
 * occurrence, and booked again when the row changes and when the job has run (D-522).
 * <p>
 * JobRunr takes a job ID once and skips a later job with the same ID, even after the first was deleted (RM-00), so the
 * ID holds a revision: {@code UUID("reminder:<kind>:<id>:<rev>")}, with {@code rev} in the row's {@code reminder_rev}
 * column. Booking again goes up one revision with an atomic {@code UPDATE}, cancels the job of the old revision and
 * books the new one; a job whose revision is no longer the row's does nothing when it runs, so a job left behind by a
 * race is harmless. Nothing here holds a lock: the worst a race does is one reminder booked a moment late, and the
 * sweep at start-up ({@link #catchUp}) finds a row left without a job.
 * <p>
 * Booking and cancelling run after the commit of the change ({@link ReminderChange}), so no job exists for a change that
 * was rolled back.
 */
@Component
public class ReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    /** The states of a job that will still run. */
    private static final List<StateName> LIVE = List.of(StateName.SCHEDULED, StateName.ENQUEUED, StateName.PROCESSING,
            StateName.AWAITING);

    private final CalendarEventRepository events;
    private final TaskRepository tasks;
    private final JdbcClient jdbc;
    private final StorageProvider storage;
    private final ReminderFiring firing;
    private final PlannerProperties properties;
    private final Clock clock;
    private final TransactionTemplate readOnly;
    private final TransactionTemplate fresh;

    ReminderScheduler(CalendarEventRepository events, TaskRepository tasks, JdbcClient jdbc, StorageProvider storage,
            ReminderFiring firing, PlannerProperties properties, Clock clock, PlatformTransactionManager transactions) {
        this.events = events;
        this.tasks = tasks;
        this.jdbc = jdbc;
        this.storage = storage;
        this.firing = firing;
        this.properties = properties;
        this.clock = clock;
        this.readOnly = new TransactionTemplate(transactions);
        this.readOnly.setReadOnly(true);
        this.readOnly.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.fresh = new TransactionTemplate(transactions);
        this.fresh.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void onChange(ReminderChange change) {
        try {
            // After the commit the old transaction is still bound to the thread; a new one gives the SQL a connection
            // of its own that is committed.
            fresh.executeWithoutResult(status -> reschedule(change.kind(), change.id(), change.rev()));
        } catch (RuntimeException e) {
            log.error("Could not book the reminder job of {} {}; it is booked again when the application starts",
                    change.kind(), change.id(), e);
        }
    }

    /** The job of the row as it is now: the old one cancelled, a new one booked when the row has a reminder to come. */
    void reschedule(ReminderKind kind, UUID id, int knownRev) {
        OptionalInt rev = bump(kind, id);
        if (rev.isEmpty()) {
            cancel(kind, id, knownRev);
            return;
        }
        cancel(kind, id, rev.getAsInt() - 1);
        load(kind, id, clock.instant()).ifPresent(subject -> book(kind, id, rev.getAsInt(), subject.next().at()));
    }

    /**
     * The sweep at start-up: books a job for every row that has a reminder to come and no job that will still run
     * (rows made before reminders existed, and rows whose booking failed).
     *
     * @return how many jobs it booked
     */
    public int catchUp() {
        int booked = 0;
        for (ReminderKind kind : ReminderKind.values()) {
            for (Row row : rowsWithReminder(kind)) {
                if (!hasLiveJob(kind, row.id(), row.rev()) && bookNext(kind, row.id(), clock.instant())) {
                    booked++;
                }
            }
        }
        return booked;
    }

    /**
     * The body of the job (D-524, steps 1 and 5; RM-03 fills in the rest): read the row again, do nothing when it is no
     * longer what the job was booked for, fire the reminder, and book the next occurrence. The arguments are plain
     * values because JobRunr stores them as JSON.
     */
    @Job(name = "Reminder %0 %1", retries = 3)
    public void run(String kindName, UUID id, int rev, long remindAtMillis) {
        ReminderKind kind = ReminderKind.valueOf(kindName);
        Instant at = Instant.ofEpochMilli(remindAtMillis);
        Optional<Subject> subject = load(kind, id, at);
        if (subject.isEmpty() || subject.get().rev() != rev || !subject.get().next().at().equals(at)) {
            log.debug("Reminder job of {} {} (rev {}) at {} is stale, skipped", kind, id, rev, at);
            return;
        }
        Subject due = subject.get();
        firing.fire(new ReminderDue(kind, id, due.ownerId(), due.title(), due.next().date(), at));
        bookNext(kind, id, at.plusMillis(1));
    }

    /** Books the reminder at or after {@code from}, if the row has one. */
    private boolean bookNext(ReminderKind kind, UUID id, Instant from) {
        Optional<Subject> subject = load(kind, id, from);
        if (subject.isEmpty()) {
            return false;
        }
        OptionalInt rev = bump(kind, id);
        rev.ifPresent(r -> book(kind, id, r, subject.get().next().at()));
        return rev.isPresent();
    }

    private void book(ReminderKind kind, UUID id, int rev, Instant at) {
        BackgroundJob.schedule(jobId(kind, id, rev), at, () -> run(kind.name(), id, rev, at.toEpochMilli()));
        log.debug("Booked the reminder job of {} {} (rev {}) at {}", kind, id, rev, at);
    }

    private void cancel(ReminderKind kind, UUID id, int rev) {
        try {
            BackgroundJob.delete(jobId(kind, id, rev));
        } catch (JobNotFoundException e) {
            log.debug("No reminder job of {} {} (rev {}) to cancel", kind, id, rev);
        } catch (RuntimeException e) {
            log.debug("Reminder job of {} {} (rev {}) was not cancelled: {}", kind, id, rev, e.toString());
        }
    }

    private boolean hasLiveJob(ReminderKind kind, UUID id, int rev) {
        try {
            return LIVE.contains(storage.getJobById(jobId(kind, id, rev)).getState());
        } catch (JobNotFoundException e) {
            return false;
        }
    }

    static UUID jobId(ReminderKind kind, UUID id, int rev) {
        String name = "reminder:" + kind.name().toLowerCase() + ":" + id + ":" + rev;
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }

    /** Goes up one revision of the row's job; empty when the row does not exist (any more). */
    private OptionalInt bump(ReminderKind kind, UUID id) {
        return jdbc.sql("UPDATE " + table(kind) + " SET reminder_rev = reminder_rev + 1 WHERE id = :id "
                + "RETURNING reminder_rev").param("id", id).query(Integer.class).optional()
                .map(OptionalInt::of).orElse(OptionalInt.empty());
    }

    private List<Row> rowsWithReminder(ReminderKind kind) {
        String open = kind == ReminderKind.TASK ? " AND status = 'OPEN'" : "";
        return jdbc.sql("SELECT id, reminder_rev FROM " + table(kind) + " WHERE reminder_offset_minutes IS NOT NULL"
                + open).query((rs, i) -> new Row(rs.getObject("id", UUID.class), rs.getInt("reminder_rev"))).list();
    }

    private static String table(ReminderKind kind) {
        return kind == ReminderKind.EVENT ? "calendar_event" : "task";
    }

    /**
     * The row with the reminder it has at or after {@code from}; empty when the row is gone, a task is done, or no such
     * reminder is left.
     */
    private Optional<Subject> load(ReminderKind kind, UUID id, Instant from) {
        return readOnly.execute(status -> switch (kind) {
            case EVENT -> events.findById(id).flatMap(event -> subject(event.ownerId(), event.reminderRev(),
                    event.title(), ReminderTimes.next(event, properties.timeZone(), from), from));
            case TASK -> tasks.findById(id).filter(task -> task.status() == TaskStatus.OPEN)
                    .flatMap(task -> subject(task.ownerId(), task.reminderRev(), task.title(),
                            ReminderTimes.next(task, properties.timeZone()), from));
        });
    }

    private static Optional<Subject> subject(UUID ownerId, int rev, String title, ReminderOccurrence next,
            Instant from) {
        if (next == null || next.at().isBefore(from)) {
            return Optional.empty();
        }
        return Optional.of(new Subject(ownerId, rev, title, next));
    }

    private record Subject(UUID ownerId, int rev, String title, ReminderOccurrence next) {
    }

    private record Row(UUID id, int rev) {
    }

}
