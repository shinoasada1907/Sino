package dev.sino.planner.application;

import static java.time.DayOfWeek.MONDAY;
import static java.time.DayOfWeek.THURSDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.ApplicationModuleTest.BootstrapMode;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.jdbc.JdbcTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.common.error.SinoException;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.Frequency;
import dev.sino.planner.domain.PlannerErrorCode;
import dev.sino.planner.domain.Task;
import dev.sino.planner.domain.TaskStatus;
import dev.sino.planner.infrastructure.TaskRepository;

/**
 * Module test of the tasks, with the modules the planner uses (identity for the web layer), on a real PostgreSQL. The
 * test methods are not transactional, so every call commits or rolls back as it would in the application. The clock
 * is moved by hand.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, TaskServiceTests.Clocks.class })
@ActiveProfiles("test")
class TaskServiceTests {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    // Friday 02/10/2026 14:05 in Vietnam, the time of the canvas.
    private static final Instant FRIDAY = Instant.parse("2026-10-02T07:05:00Z");
    private static final RepeatRule MONDAYS = new RepeatRule(Frequency.WEEKLY, 1, Set.of(MONDAY), null, null, null);

    @Autowired
    private TaskService service;

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private MovableClock clock;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TransactionTemplate transactions;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        JdbcTestUtils.deleteFromTables(jdbc, "task", "app_user");
        owner = insertUser("owner@sino.test");
        clock.set(FRIDAY);
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", id, email);
        return id;
    }

    private Task create(String title) {
        return service.create(owner, new NewTask(title, null, null, null));
    }

    private Task create(String title, Due due, RepeatRule repeat) {
        return service.create(owner, new NewTask(title, null, due, repeat));
    }

    private static Due mondayAt9() {
        return Due.at(Instant.parse("2026-10-05T02:00:00Z"));
    }

    @Test
    void createsAnOpenTaskWithoutADue() {
        Task task = create("Gọi điện cho thợ sửa máy lạnh");

        Task stored = tasks.findById(task.id()).orElseThrow();
        assertThat(stored.ownerId()).isEqualTo(owner);
        assertThat(stored.title()).isEqualTo("Gọi điện cho thợ sửa máy lạnh");
        assertThat(stored.status()).isEqualTo(TaskStatus.OPEN);
        assertThat(stored.due()).isNull();
        assertThat(stored.recurrence()).isNull();
        assertThat(stored.seriesId()).isNull();
        assertThat(stored.createdAt()).isEqualTo(FRIDAY);
    }

    @Test
    void aRepeatingTaskStartsASeriesAndTakesTheZoneOfSino() {
        RepeatRule monthly = new RepeatRule(Frequency.MONTHLY, 1, null, null, null, null);

        Task task = create("Chuyển tiền nhà", Due.at(Instant.parse("2026-11-02T10:00:00Z")), monthly);

        Task stored = tasks.findById(task.id()).orElseThrow();
        assertThat(stored.seriesId()).isNotNull();
        assertThat(version(task.id())).isZero();
        assertThat(stored.occurrenceIndex()).isZero();
        assertThat(stored.recurrence().byMonthDay()).isEqualTo(2);
        assertThat(stored.recurrence().timeZone()).isEqualTo(VIETNAM);
        assertThat(stored.due()).isEqualTo(Due.at(Instant.parse("2026-11-02T10:00:00Z")));
    }

    @Test
    void weekdaysAreStoredAndReadBack() {
        RepeatRule mondaysAndThursdays = new RepeatRule(Frequency.WEEKLY, 2, Set.of(THURSDAY, MONDAY), null, null, 10);

        Task task = create("Chạy bộ", mondayAt9(), mondaysAndThursdays);

        Task stored = tasks.findById(task.id()).orElseThrow();
        assertThat(stored.recurrence().byWeekdays()).containsExactly(MONDAY, THURSDAY);
        assertThat(stored.recurrence().interval()).isEqualTo(2);
        assertThat(stored.recurrence().count()).isEqualTo(10);
        assertThat(jdbc.queryForObject("select rec_by_weekdays from task where id = ?", String.class, task.id()))
                .isEqualTo("MONDAY,THURSDAY");
    }

    @Test
    void aRuleThatDoesNotFitItsDueIsRefused() {
        // Wednesday 07/10 in Vietnam, but the rule only has Mondays.
        Due wednesday = Due.on(LocalDate.parse("2026-10-07"));

        assertThatThrownBy(() -> create("Báo cáo tuần", wednesday, MONDAYS))
                .isInstanceOfSatisfying(SinoException.class,
                        e -> assertThat(e.errorCode()).isEqualTo(PlannerErrorCode.INVALID_RECURRENCE));
        assertThat(tasks.count()).isZero();
    }

    @Test
    void theWeekdayOfADueMomentIsTheDayInTheZoneOfSino() {
        // 18:00 UTC on Sunday 04/10 is Monday 05/10 01:00 in Vietnam.
        Task task = create("Báo cáo tuần", Due.at(Instant.parse("2026-10-04T18:00:00Z")), MONDAYS);

        assertThat(task.recurrence()).isNotNull();
    }

    @Test
    void listsOpenTasksAndTasksDoneInTheLastSevenDays() {
        Task open = create("Đang mở");
        Task doneLongAgo = create("Xong 8 ngày trước");
        Task doneYesterday = create("Xong hôm qua");
        clock.set(FRIDAY.minus(Duration.ofDays(8)));
        service.complete(owner, doneLongAgo.id());
        clock.set(FRIDAY.minus(Duration.ofDays(1)));
        service.complete(owner, doneYesterday.id());
        clock.set(FRIDAY);

        List<Task> listed = service.list(owner);

        assertThat(listed).extracting(Task::id).containsExactly(open.id(), doneYesterday.id());
    }

    @Test
    void listsOnlyTheTasksOfTheCaller() {
        UUID someoneElse = insertUser("other@sino.test");
        service.create(someoneElse, new NewTask("Của người khác", null, null, null));
        Task mine = create("Của tôi");

        assertThat(service.list(owner)).extracting(Task::id).containsExactly(mine.id());
    }

    @Test
    void updatesTheGivenFieldsAndLeavesTheOthers() {
        Task task = service.create(owner, new NewTask("Hợp đồng", "Xem điều khoản 4", null, null));
        clock.set(FRIDAY.plusSeconds(60));

        Task renamed = service.update(owner, task.id(), "Trả lời: Hợp đồng", null);
        assertThat(renamed.title()).isEqualTo("Trả lời: Hợp đồng");
        assertThat(renamed.notes()).isEqualTo("Xem điều khoản 4");
        assertThat(renamed.updatedAt()).isEqualTo(FRIDAY.plusSeconds(60));

        Task withoutNotes = service.update(owner, task.id(), null, "   ");
        assertThat(withoutNotes.title()).isEqualTo("Trả lời: Hợp đồng");
        assertThat(withoutNotes.notes()).isNull();
    }

    @Test
    void schedulesAndClearsTheDueAndRule() {
        Task task = create("Báo cáo tuần");

        Task scheduled = service.schedule(owner, task.id(), mondayAt9(), MONDAYS);
        assertThat(scheduled.due()).isEqualTo(mondayAt9());
        assertThat(scheduled.recurrence().byWeekdays()).containsExactly(MONDAY);
        assertThat(scheduled.seriesId()).isNotNull();

        Task cleared = service.schedule(owner, task.id(), null, null);
        Task stored = tasks.findById(task.id()).orElseThrow();
        assertThat(cleared.due()).isNull();
        assertThat(stored.due()).isNull();
        assertThat(stored.recurrence()).isNull();
        assertThat(stored.seriesId()).isEqualTo(scheduled.seriesId());
    }

    @Test
    void completingARepeatingTaskMakesTheNextOccurrenceOnce() {
        Task task = create("Báo cáo tuần", mondayAt9(), MONDAYS);
        clock.set(Instant.parse("2026-10-07T03:00:00Z"));

        CompletedTask done = service.complete(owner, task.id());

        assertThat(done.task().status()).isEqualTo(TaskStatus.DONE);
        assertThat(done.task().completedAt()).isEqualTo(Instant.parse("2026-10-07T03:00:00Z"));
        assertThat(done.next()).isNotNull();
        assertThat(done.next().due()).isEqualTo(Due.at(Instant.parse("2026-10-12T02:00:00Z")));
        assertThat(done.next().seriesId()).isNotNull().isEqualTo(task.seriesId());
        assertThat(done.next().occurrenceIndex()).isEqualTo(1);
        assertThat(tasks.findById(done.next().id())).isPresent();

        CompletedTask again = service.complete(owner, task.id());

        assertThat(again.task().status()).isEqualTo(TaskStatus.DONE);
        assertThat(again.next()).isNull();
        assertThat(tasks.count()).isEqualTo(2);
    }

    @Test
    void completingATaskWithoutARuleMakesNothingElse() {
        Task task = create("Gửi hóa đơn", mondayAt9(), null);

        assertThat(service.complete(owner, task.id()).next()).isNull();
        assertThat(tasks.count()).isEqualTo(1);
    }

    @Test
    void reopeningKeepsTheNextOccurrence() {
        Task task = create("Báo cáo tuần", mondayAt9(), MONDAYS);
        CompletedTask done = service.complete(owner, task.id());

        Task reopened = service.reopen(owner, task.id());

        assertThat(reopened.status()).isEqualTo(TaskStatus.OPEN);
        assertThat(reopened.completedAt()).isNull();
        assertThat(tasks.findById(done.next().id()).orElseThrow().status()).isEqualTo(TaskStatus.OPEN);
    }

    @Test
    void deletingTheOpenTaskOfASeriesKeepsTheDoneOnes() {
        Task first = create("Báo cáo tuần", mondayAt9(), MONDAYS);
        Task next = service.complete(owner, first.id()).next();

        service.delete(owner, next.id());

        assertThat(tasks.findById(next.id())).isEmpty();
        assertThat(tasks.findById(first.id())).isPresent();
    }

    @Test
    void theTaskOfAnotherUserIsNotFound() {
        UUID someoneElse = insertUser("other@sino.test");
        Task theirs = service.create(someoneElse, new NewTask("Của người khác", null, null, null));
        UUID id = theirs.id();

        List<Runnable> calls = List.of(() -> service.get(owner, id), () -> service.update(owner, id, "x", null),
                () -> service.schedule(owner, id, null, null), () -> service.complete(owner, id),
                () -> service.reopen(owner, id), () -> service.delete(owner, id));
        for (Runnable call : calls) {
            assertThatThrownBy(call::run).isInstanceOfSatisfying(SinoException.class,
                    e -> assertThat(e.errorCode()).isEqualTo(PlannerErrorCode.TASK_NOT_FOUND));
        }
        assertThat(tasks.findById(id).orElseThrow().title()).isEqualTo("Của người khác");
    }

    @Test
    void aMissingTaskIsNotFound() {
        assertThatThrownBy(() -> service.get(owner, UUID.randomUUID())).isInstanceOfSatisfying(SinoException.class,
                e -> assertThat(e.errorCode()).isEqualTo(PlannerErrorCode.TASK_NOT_FOUND));
    }

    @Test
    void aChangeOverAnOlderReadIsRefused() {
        Task task = create("Hợp đồng");

        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            Task stale = tasks.findById(task.id()).orElseThrow();
            // Another request changes the task in its own transaction while this one still holds the old read.
            CompletableFuture.runAsync(() -> service.update(owner, task.id(), "Đổi ở nơi khác", null)).join();
            stale.rename("Đổi ở đây", FRIDAY);
            tasks.flush();
        })).isInstanceOf(OptimisticLockingFailureException.class);
        assertThat(tasks.findById(task.id()).orElseThrow().title()).isEqualTo("Đổi ở nơi khác");
    }

    @Test
    void doneOpenedAgainAndDoneAgainMakesNoSecondNextOccurrence() {
        Task task = create("Báo cáo tuần", mondayAt9(), MONDAYS);
        service.complete(owner, task.id());
        service.reopen(owner, task.id());

        CompletedTask again = service.complete(owner, task.id());

        assertThat(again.task().status()).isEqualTo(TaskStatus.DONE);
        assertThat(again.next()).isNull();
        assertThat(tasks.count()).isEqualTo(2);
    }

    @Test
    void completingTheLastOccurrenceMakesNoNext() {
        RepeatRule once = new RepeatRule(Frequency.DAILY, 1, null, null, null, 1);
        Task task = create("Uống thuốc", Due.on(LocalDate.parse("2026-10-02")), once);

        assertThat(service.complete(owner, task.id()).next()).isNull();
        assertThat(tasks.count()).isEqualTo(1);
    }

    @Test
    void twoCompletionsThatReadTheSameOpenTaskMakeOneNextOccurrence() {
        Task task = create("Báo cáo tuần", mondayAt9(), MONDAYS);

        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            Task stale = tasks.findById(task.id()).orElseThrow();
            CompletableFuture.runAsync(() -> service.complete(owner, task.id())).join();
            stale.complete(FRIDAY);
            stale.makeNextOccurrence(FRIDAY).ifPresent(tasks::save);
            tasks.flush();
        })).isInstanceOf(OptimisticLockingFailureException.class);
        assertThat(tasks.count()).isEqualTo(2);
    }

    @Test
    void aCallThatChangesNothingKeepsTheVersion() {
        RepeatRule mondaysAndThursdays = new RepeatRule(Frequency.WEEKLY, 1, Set.of(MONDAY, THURSDAY), null, null, null);
        Task task = create("Chạy bộ", mondayAt9(), mondaysAndThursdays);

        service.reopen(owner, task.id());
        service.get(owner, task.id());

        assertThat(version(task.id())).isZero();
    }

    private long version(UUID id) {
        return jdbc.queryForObject("select version from task where id = ?", Long.class, id);
    }

    static Stream<Arguments> brokenRows() {
        Timestamp moment = Timestamp.from(Instant.parse("2026-10-05T02:00:00Z"));
        Date day = Date.valueOf("2026-10-05");
        String zone = "Asia/Ho_Chi_Minh";
        UUID series = UUID.randomUUID();
        return Stream.of(
                Arguments.of("both kinds of due", Map.of("due_at", moment, "due_date", day), "task_one_due_ck"),
                Arguments.of("done without when", Map.of("status", "DONE"), "task_completed_ck"),
                Arguments.of("open with when it was done", Map.of("completed_at", moment), "task_completed_ck"),
                Arguments.of("a rule without a due",
                        Map.of("rec_freq", "DAILY", "rec_interval", 1, "rec_time_zone", zone, "series_id", series),
                        "task_recurrence_ck"),
                Arguments.of("half a rule", Map.of("due_at", moment, "rec_freq", "DAILY", "series_id", series),
                        "task_recurrence_ck"),
                Arguments.of("an end day and a count", rule(moment, series, "DAILY", Map.of("rec_until_date", day,
                        "rec_count", 3)), "task_recurrence_ck"),
                Arguments.of("weekly without weekdays", rule(moment, series, "WEEKLY", Map.of()), "task_recurrence_ck"),
                Arguments.of("weekdays on a daily rule",
                        rule(moment, series, "DAILY", Map.of("rec_by_weekdays", "MONDAY")), "task_recurrence_ck"),
                Arguments.of("a day of the month on a daily rule",
                        rule(moment, series, "DAILY", Map.of("rec_by_month_day", 5)), "task_recurrence_ck"),
                Arguments.of("monthly without its day", rule(moment, series, "MONTHLY", Map.of()),
                        "task_recurrence_ck"),
                Arguments.of("every 0", rule(moment, series, "DAILY", Map.of("rec_interval", 0)), "task_recurrence_ck"),
                Arguments.of("every 100", rule(moment, series, "DAILY", Map.of("rec_interval", 100)),
                        "task_recurrence_ck"),
                Arguments.of("a count of 0", rule(moment, series, "DAILY", Map.of("rec_count", 0)),
                        "task_recurrence_ck"),
                Arguments.of("a count of 1000", rule(moment, series, "DAILY", Map.of("rec_count", 1000)),
                        "task_recurrence_ck"),
                Arguments.of("a rule without a series", rule(moment, null, "DAILY", Map.of()), "task_series_ck"),
                Arguments.of("a negative place in the series", Map.of("occurrence_index", -1),
                        "task_occurrence_index_ck"),
                Arguments.of("notes over 20 000 characters", Map.of("notes", "x".repeat(20_001)),
                        "task_notes_length_ck"),
                Arguments.of("a title over 200 characters", Map.of("title", "x".repeat(201)), "character varying(200)"));
    }

    /** A rule row of {@code freq}, with {@code changes} over a whole daily-style rule. */
    private static Map<String, Object> rule(Timestamp due, UUID series, String freq, Map<String, Object> changes) {
        Map<String, Object> row = new HashMap<>();
        row.put("due_at", due);
        row.put("rec_freq", freq);
        row.put("rec_interval", 1);
        row.put("rec_time_zone", "Asia/Ho_Chi_Minh");
        if (series != null) {
            row.put("series_id", series);
        }
        row.putAll(changes);
        return row;
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("brokenRows")
    void theDatabaseRefusesATaskThatBreaksItsRules(String name, Map<String, Object> changes, String refusedBy) {
        assertThatThrownBy(() -> insertRow(changes)).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(refusedBy);
        assertThat(tasks.count()).isZero();
    }

    @Test
    void theDatabaseTakesAWholeRule() {
        Timestamp moment = Timestamp.from(Instant.parse("2026-10-05T02:00:00Z"));

        insertRow(rule(moment, UUID.randomUUID(), "WEEKLY", Map.of("rec_by_weekdays", "MONDAY")));
        insertRow(rule(moment, UUID.randomUUID(), "MONTHLY", Map.of("rec_by_month_day", 5, "rec_count", 3)));
        insertRow(Map.of("status", "DONE", "completed_at", moment));

        assertThat(tasks.count()).isEqualTo(3);
    }

    private void insertRow(Map<String, Object> changes) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", UUID.randomUUID());
        row.put("user_id", owner);
        row.put("title", "x");
        row.put("status", "OPEN");
        row.put("occurrence_index", 0);
        row.put("created_at", Timestamp.from(FRIDAY));
        row.put("updated_at", Timestamp.from(FRIDAY));
        row.put("version", 0);
        row.putAll(changes);
        String sql = "insert into task (" + String.join(", ", row.keySet()) + ") values ("
                + "?, ".repeat(row.size() - 1) + "?)";
        jdbc.update(sql, row.values().toArray());
    }

    /** The clock of these tests, moved by hand. */
    @TestConfiguration(proxyBeanMethods = false)
    static class Clocks {

        @Bean
        @Primary
        MovableClock movableClock() {
            return new MovableClock(FRIDAY);
        }

    }

    static final class MovableClock extends Clock {

        private volatile Instant now;

        MovableClock(Instant start) {
            this.now = start;
        }

        void set(Instant instant) {
            now = instant;
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

    }

}
