package dev.sino.planner.application.reminder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.jdbc.JdbcTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.planner.application.EventService;
import dev.sino.planner.application.NewEvent;
import dev.sino.planner.application.NewTask;
import dev.sino.planner.application.RepeatRule;
import dev.sino.planner.application.TaskService;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.EventTime;
import dev.sino.planner.domain.Frequency;
import dev.sino.planner.domain.Reminder;
import dev.sino.planner.domain.ReminderKind;
import dev.sino.planner.domain.Task;

/**
 * The reminder jobs of planner (D-522) on the whole application and a real PostgreSQL. The job server is off in the
 * tests, so the tests read the booked jobs in {@code jobrunr_jobs} and call the body of a job themselves.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ReminderSchedulerTests {

    // Monday 07/01/2030 10:00 – 11:00 in Vietnam, far ahead so the real clock never matters; a 15-minute reminder
    // fires at 09:45 (02:45Z).
    private static final Instant START = Instant.parse("2030-01-07T03:00:00Z");
    private static final Instant REMIND_AT = Instant.parse("2030-01-07T02:45:00Z");
    private static final RepeatRule DAILY = new RepeatRule(Frequency.DAILY, 1, Set.of(), null, null, null);

    @Autowired
    private EventService events;

    @Autowired
    private TaskService tasks;

    @Autowired
    private ReminderScheduler scheduler;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TransactionTemplate transactions;

    @MockitoBean
    private ReminderFiring firing;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        owner = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", owner, owner + "@sino.test");
    }

    /** Other tests delete users and look at these tables; nothing of this one may stay. */
    @AfterEach
    void leaveNothing() {
        JdbcTestUtils.deleteFromTables(jdbc, "calendar_event", "task", "jobrunr_jobs");
        jdbc.update("delete from app_user where id = ?", owner);
    }

    private CalendarEvent event(Instant start, RepeatRule repeat, Reminder reminder) {
        return events.create(owner, new NewEvent("Họp", null, null, EventTime.timed(start, start.plusSeconds(3600)),
                repeat, reminder, false));
    }

    private static NewEvent replacement(Instant start, Reminder reminder) {
        return new NewEvent("Họp", null, null, EventTime.timed(start, start.plusSeconds(3600)), null, reminder, false);
    }

    private int rev(String table, UUID id) {
        return jdbc.queryForObject("select reminder_rev from " + table + " where id = ?", Integer.class, id);
    }

    private String state(ReminderKind kind, UUID id, int rev) {
        List<String> states = jdbc.queryForList("select state from jobrunr_jobs where id = ?", String.class,
                ReminderScheduler.jobId(kind, id, rev).toString());
        return states.isEmpty() ? "NONE" : states.get(0);
    }

    private Instant scheduledAt(ReminderKind kind, UUID id, int rev) {
        LocalDateTime utc = jdbc.queryForObject("select scheduledat from jobrunr_jobs where id = ?",
                LocalDateTime.class, ReminderScheduler.jobId(kind, id, rev).toString());
        return utc.toInstant(ZoneOffset.UTC);
    }

    private int jobCount() {
        return JdbcTestUtils.countRowsInTable(jdbc, "jobrunr_jobs");
    }

    @Test
    void booksAJobAtTheReminderTimeWhenAnEventIsCreated() {
        CalendarEvent event = event(START, null, new Reminder(15));

        assertThat(rev("calendar_event", event.id())).isEqualTo(1);
        assertThat(state(ReminderKind.EVENT, event.id(), 1)).isEqualTo("SCHEDULED");
        assertThat(scheduledAt(ReminderKind.EVENT, event.id(), 1)).isEqualTo(REMIND_AT);
    }

    @Test
    void booksNothingWithoutAReminderOrWhenTheReminderIsPast() {
        event(START, null, null);
        event(Instant.parse("2020-01-07T03:00:00Z"), null, new Reminder(15));

        assertThat(jobCount()).isZero();
    }

    @Test
    void movesTheJobWhenTheEventIsReplacedAndCancelsItWhenTheReminderIsRemovedOrTheEventDeleted() {
        CalendarEvent event = event(START, null, new Reminder(15));
        UUID id = event.id();

        events.replace(owner, id, replacement(START.plusSeconds(3600), new Reminder(15)));
        assertThat(state(ReminderKind.EVENT, id, 1)).isEqualTo("DELETED");
        assertThat(state(ReminderKind.EVENT, id, 2)).isEqualTo("SCHEDULED");
        assertThat(scheduledAt(ReminderKind.EVENT, id, 2)).isEqualTo(REMIND_AT.plusSeconds(3600));

        events.replace(owner, id, replacement(START, null));
        assertThat(state(ReminderKind.EVENT, id, 2)).isEqualTo("DELETED");
        assertThat(state(ReminderKind.EVENT, id, 3)).isEqualTo("NONE");

        events.replace(owner, id, replacement(START, new Reminder(30)));
        assertThat(state(ReminderKind.EVENT, id, 4)).isEqualTo("SCHEDULED");
        events.delete(owner, id);
        assertThat(state(ReminderKind.EVENT, id, 4)).isEqualTo("DELETED");
    }

    @Test
    void aRolledBackChangeBooksNothing() {
        try {
            transactions.executeWithoutResult(status -> {
                event(START, null, new Reminder(15));
                throw new IllegalStateException("rolled back");
            });
        } catch (IllegalStateException expected) {
            // the point of the test
        }

        assertThat(jobCount()).isZero();
    }

    @Test
    void aTaskJobIsCancelledWhenTheTaskIsDoneAndTheNextOccurrenceGetsItsOwn() {
        Task task = tasks.create(owner, new NewTask("Uống thuốc", null, Due.at(START), DAILY, new Reminder(15)));
        assertThat(state(ReminderKind.TASK, task.id(), 1)).isEqualTo("SCHEDULED");

        Task next = tasks.complete(owner, task.id()).next();

        assertThat(state(ReminderKind.TASK, task.id(), 1)).isEqualTo("DELETED");
        assertThat(next).isNotNull();
        assertThat(state(ReminderKind.TASK, next.id(), 1)).isEqualTo("SCHEDULED");
        assertThat(scheduledAt(ReminderKind.TASK, next.id(), 1)).isEqualTo(REMIND_AT.plusSeconds(24 * 3600));
    }

    @Test
    void aReopenedTaskIsBookedAgain() {
        Task task = tasks.create(owner, new NewTask("Nộp báo cáo", null, Due.at(START), null, new Reminder(15)));
        tasks.complete(owner, task.id());
        assertThat(state(ReminderKind.TASK, task.id(), 1)).isEqualTo("DELETED");

        tasks.reopen(owner, task.id());

        // Every change goes up one revision: created 1, done 2, opened again 3.
        assertThat(state(ReminderKind.TASK, task.id(), 3)).isEqualTo("SCHEDULED");
    }

    @Test
    void aDueJobFiresOnceAndBooksTheNextOccurrenceOfARepeatingEvent() {
        CalendarEvent event = event(START, DAILY, new Reminder(15));

        scheduler.run("EVENT", event.id(), 1, REMIND_AT.toEpochMilli());

        ArgumentCaptor<ReminderDue> due = ArgumentCaptor.forClass(ReminderDue.class);
        verify(firing).fire(due.capture());
        assertThat(due.getValue()).isEqualTo(new ReminderDue(ReminderKind.EVENT, event.id(), owner, "Họp",
                LocalDate.parse("2030-01-07"), REMIND_AT));
        assertThat(rev("calendar_event", event.id())).isEqualTo(2);
        assertThat(scheduledAt(ReminderKind.EVENT, event.id(), 2)).isEqualTo(REMIND_AT.plusSeconds(24 * 3600));
    }

    @Test
    void aDueJobOfASingleEventBooksNothingMore() {
        CalendarEvent event = event(START, null, new Reminder(15));

        scheduler.run("EVENT", event.id(), 1, REMIND_AT.toEpochMilli());

        verify(firing).fire(any());
        assertThat(rev("calendar_event", event.id())).isEqualTo(1);
    }

    @Test
    void aJobThatIsNoLongerWhatWasBookedDoesNothing() {
        CalendarEvent edited = event(START, null, new Reminder(15));
        events.replace(owner, edited.id(), replacement(START.plusSeconds(3600), new Reminder(15)));
        CalendarEvent deleted = event(START, null, new Reminder(15));
        events.delete(owner, deleted.id());
        Task done = tasks.create(owner, new NewTask("Xong", null, Due.at(START), null, new Reminder(15)));
        tasks.complete(owner, done.id());

        scheduler.run("EVENT", edited.id(), 1, REMIND_AT.toEpochMilli());
        scheduler.run("EVENT", deleted.id(), 1, REMIND_AT.toEpochMilli());
        scheduler.run("TASK", done.id(), 1, REMIND_AT.toEpochMilli());
        // The right revision but a time that is not the reminder time of the event any more.
        scheduler.run("EVENT", edited.id(), 2, REMIND_AT.toEpochMilli());

        verify(firing, never()).fire(any());
    }

    @Test
    void theSweepBooksARowWithoutAJobAndLeavesOneThatHasAJob() {
        CalendarEvent withJob = event(START, null, new Reminder(15));
        CalendarEvent lost = event(START, null, new Reminder(15));
        jdbc.update("delete from jobrunr_jobs where id = ?", ReminderScheduler.jobId(ReminderKind.EVENT, lost.id(), 1)
                .toString());

        assertThat(scheduler.catchUp()).isEqualTo(1);

        assertThat(state(ReminderKind.EVENT, withJob.id(), 1)).isEqualTo("SCHEDULED");
        assertThat(state(ReminderKind.EVENT, lost.id(), 2)).isEqualTo("SCHEDULED");
        assertThat(scheduler.catchUp()).isZero();
    }

}
