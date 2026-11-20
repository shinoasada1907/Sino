package dev.sino.planner.application;

import static java.time.DayOfWeek.MONDAY;
import static java.time.DayOfWeek.THURSDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.jdbc.JdbcTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.common.error.SinoException;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.EventTime;
import dev.sino.planner.domain.Frequency;
import dev.sino.planner.domain.PlannerErrorCode;
import dev.sino.planner.domain.Reminder;
import dev.sino.planner.infrastructure.CalendarEventRepository;
import dev.sino.settings.SettingsDirectory;

/**
 * Module test of the appointments, on a real PostgreSQL. The test methods are not transactional, so every call commits
 * or rolls back as it would in the application.
 */
@ApplicationModuleTest(mode = BootstrapMode.ALL_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, EventServiceTests.Clocks.class })
@ActiveProfiles("test")
class EventServiceTests {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Instant FRIDAY = Instant.parse("2026-10-02T07:05:00Z");
    // Thursday 15/10/2026 10:00 – 11:00 in Vietnam.
    private static final Instant THURSDAY_10 = Instant.parse("2026-10-15T03:00:00Z");
    private static final RepeatRule THURSDAYS = new RepeatRule(Frequency.WEEKLY, 1, Set.of(THURSDAY), null, null, null);

    @Autowired
    private EventService service;

    @Autowired
    private CalendarEventRepository events;

    @Autowired
    private MovableClock clock;

    @MockitoBean
    private SettingsDirectory settings;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TransactionTemplate transactions;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        JdbcTestUtils.deleteFromTables(jdbc, "calendar_event", "task", "app_user");
        owner = insertUser("owner@sino.test");
        clock.set(FRIDAY);
    }

    /** Other tests delete users; a row left here would stop them. */
    @AfterEach
    void leaveNoRows() {
        JdbcTestUtils.deleteFromTables(jdbc, "calendar_event");
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", id, email);
        return id;
    }

    private static EventTime meeting() {
        return EventTime.timed(THURSDAY_10, THURSDAY_10.plusSeconds(3600));
    }

    private CalendarEvent create(String title, EventTime time, RepeatRule repeat) {
        return service.create(owner, new NewEvent(title, null, null, time, repeat));
    }

    @Test
    void createsATimedAppointmentWithItsDetails() {
        CalendarEvent event = service.create(owner,
                new NewEvent("  Họp nhóm  ", "  Phòng 3 ", "Mang laptop", meeting(), null));

        CalendarEvent stored = events.findById(event.id()).orElseThrow();
        assertThat(stored.ownerId()).isEqualTo(owner);
        assertThat(stored.title()).isEqualTo("Họp nhóm");
        assertThat(stored.location()).isEqualTo("Phòng 3");
        assertThat(stored.notes()).isEqualTo("Mang laptop");
        assertThat(stored.time()).isEqualTo(meeting());
        assertThat(stored.recurrence()).isNull();
        assertThat(stored.createdAt()).isEqualTo(FRIDAY);
        assertThat(stored.updatedAt()).isEqualTo(FRIDAY);
    }

    @Test
    void createsAWholeDayAppointmentAndBlankPlaceAndNotesAreNone() {
        EventTime birthday = EventTime.wholeDays(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-02"));

        CalendarEvent event = service.create(owner, new NewEvent("Sinh nhật Hà", "   ", "  ", birthday, null));

        CalendarEvent stored = events.findById(event.id()).orElseThrow();
        assertThat(stored.time()).isEqualTo(birthday);
        assertThat(stored.location()).isNull();
        assertThat(stored.notes()).isNull();
    }

    @Test
    void aRepeatingAppointmentTakesTheZoneOfSinoAndKeepsItsStartDay() {
        RepeatRule monthly = new RepeatRule(Frequency.MONTHLY, 1, null, null, null, 6);
        // 15/10 in Vietnam, but 14/10 in UTC: the day is taken in the rule's zone.
        EventTime lateNight = EventTime.timed(Instant.parse("2026-10-14T20:00:00Z"),
                Instant.parse("2026-10-14T21:00:00Z"));

        CalendarEvent event = create("Trả tiền điện", lateNight, monthly);

        CalendarEvent stored = events.findById(event.id()).orElseThrow();
        assertThat(stored.recurrence().timeZone()).isEqualTo(VIETNAM);
        assertThat(stored.recurrence().byMonthDay()).isEqualTo(15);
        assertThat(stored.recurrence().count()).isEqualTo(6);
    }

    @Test
    void aRuleThatDoesNotFitTheStartIsRefusedAndStoresNothing() {
        RepeatRule mondays = new RepeatRule(Frequency.WEEKLY, 1, Set.of(MONDAY), null, null, null);

        assertThatThrownBy(() -> create("Họp", meeting(), mondays)).isInstanceOfSatisfying(SinoException.class,
                e -> assertThat(e.errorCode()).isEqualTo(PlannerErrorCode.INVALID_RECURRENCE));
        assertThat(events.count()).isZero();
    }

    @Test
    void replaceChangesEverythingAndTheSeriesWithIt() {
        CalendarEvent event = service.create(owner, new NewEvent("Họp nhóm", "Phòng 3", "Ghi chú", meeting(), THURSDAYS));
        clock.set(FRIDAY.plusSeconds(60));
        EventTime afternoon = EventTime.timed(THURSDAY_10.plusSeconds(4 * 3600), THURSDAY_10.plusSeconds(5 * 3600));

        service.replace(owner, event.id(), new NewEvent("Họp nhóm tuần", null, null, afternoon, THURSDAYS));

        CalendarEvent stored = events.findById(event.id()).orElseThrow();
        assertThat(stored.title()).isEqualTo("Họp nhóm tuần");
        assertThat(stored.location()).isNull();
        assertThat(stored.notes()).isNull();
        assertThat(stored.time()).isEqualTo(afternoon);
        assertThat(stored.recurrence().frequency()).isEqualTo(Frequency.WEEKLY);
        assertThat(stored.createdAt()).isEqualTo(FRIDAY);
        assertThat(stored.updatedAt()).isEqualTo(FRIDAY.plusSeconds(60));
        assertThat(events.count()).isEqualTo(1);
    }

    @Test
    void replaceCanDropTheRuleAndSwitchTheKindOfTime() {
        CalendarEvent event = create("Họp nhóm", meeting(), THURSDAYS);
        EventTime wholeDay = EventTime.wholeDays(LocalDate.parse("2026-10-15"), LocalDate.parse("2026-10-16"));

        service.replace(owner, event.id(), new NewEvent("Họp nhóm", null, null, wholeDay, null));

        CalendarEvent stored = events.findById(event.id()).orElseThrow();
        assertThat(stored.recurrence()).isNull();
        assertThat(stored.time()).isEqualTo(wholeDay);
    }

    @Test
    void aRefusedReplaceChangesNothing() {
        CalendarEvent event = create("Họp nhóm", meeting(), THURSDAYS);
        RepeatRule mondays = new RepeatRule(Frequency.WEEKLY, 1, Set.of(MONDAY), null, null, null);

        assertThatThrownBy(() -> service.replace(owner, event.id(), new NewEvent("Đổi", null, null, meeting(), mondays)))
                .isInstanceOf(SinoException.class);

        CalendarEvent stored = events.findById(event.id()).orElseThrow();
        assertThat(stored.title()).isEqualTo("Họp nhóm");
        assertThat(stored.recurrence().byWeekdays()).containsExactly(THURSDAY);
    }

    @Test
    void getReadsTheWholeSeries() {
        CalendarEvent event = create("Họp nhóm", meeting(), THURSDAYS);

        CalendarEvent read = service.get(owner, event.id());

        assertThat(read.time()).isEqualTo(meeting());
        assertThat(read.recurrence().byWeekdays()).containsExactly(THURSDAY);
    }

    @Test
    void deleteRemovesTheAppointmentOnceForTheWholeSeries() {
        CalendarEvent event = create("Chạy bộ", meeting(), THURSDAYS);
        CalendarEvent other = create("Việc khác", meeting(), null);

        service.delete(owner, event.id());

        assertThat(events.findAll()).extracting(CalendarEvent::id).containsExactly(other.id());
    }

    @Test
    void anAppointmentOfAnotherUserIsNotFoundAndLeftAlone() {
        UUID someoneElse = insertUser("other@sino.test");
        CalendarEvent theirs = service.create(someoneElse, new NewEvent("Của người khác", null, null, meeting(), null));
        UUID id = theirs.id();
        NewEvent draft = new NewEvent("Đổi", null, null, meeting(), null);

        for (Runnable call : new Runnable[] { () -> service.get(owner, id), () -> service.replace(owner, id, draft),
                () -> service.delete(owner, id) }) {
            assertThatThrownBy(call::run).isInstanceOfSatisfying(SinoException.class,
                    e -> assertThat(e.errorCode()).isEqualTo(PlannerErrorCode.EVENT_NOT_FOUND));
        }
        assertThat(events.findById(id).orElseThrow().title()).isEqualTo("Của người khác");
    }

    @Test
    void aMissingAppointmentIsNotFound() {
        assertThatThrownBy(() -> service.get(owner, UUID.randomUUID())).isInstanceOfSatisfying(SinoException.class,
                e -> assertThat(e.errorCode()).isEqualTo(PlannerErrorCode.EVENT_NOT_FOUND));
    }

    @Test
    void aChangeOverAnOlderReadIsRefused() {
        CalendarEvent event = create("Họp nhóm", meeting(), null);

        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            CalendarEvent stale = events.findById(event.id()).orElseThrow();
            // Another request replaces the appointment in its own transaction while this one holds the old read.
            CompletableFuture.runAsync(() -> service.replace(owner, event.id(),
                    new NewEvent("Đổi ở nơi khác", null, null, meeting(), null))).join();
            stale.replace("Đổi ở đây", null, null, meeting(), null, FRIDAY);
            events.flush();
        })).isInstanceOf(OptimisticLockingFailureException.class);
        assertThat(events.findById(event.id()).orElseThrow().title()).isEqualTo("Đổi ở nơi khác");
    }

    static Stream<Arguments> brokenRows() {
        Timestamp start = Timestamp.from(THURSDAY_10);
        Timestamp end = Timestamp.from(THURSDAY_10.plusSeconds(3600));
        Date day = Date.valueOf("2026-10-15");
        Date nextDay = Date.valueOf("2026-10-16");
        return Stream.of(
                Arguments.of("no time", Map.of("starts_at", "-", "ends_at", "-"), "calendar_event_time_ck"),
                Arguments.of("both kinds of time", Map.of("start_date", day, "end_date", nextDay),
                        "calendar_event_time_ck"),
                Arguments.of("half a span", Map.of("ends_at", "-"), "calendar_event_time_ck"),
                Arguments.of("an end before the start", Map.of("starts_at", end, "ends_at", start),
                        "calendar_event_time_ck"),
                Arguments.of("a span of 14 days and a second",
                        Map.of("ends_at", Timestamp.from(THURSDAY_10.plusSeconds(14 * 24 * 3600L + 1))),
                        "calendar_event_time_ck"),
                Arguments.of("whole days ending on the start day",
                        Map.of("starts_at", "-", "ends_at", "-", "start_date", day, "end_date", day),
                        "calendar_event_time_ck"),
                Arguments.of("whole days over 14 days",
                        Map.of("starts_at", "-", "ends_at", "-", "start_date", day,
                                "end_date", Date.valueOf("2026-10-30")),
                        "calendar_event_time_ck"),
                Arguments.of("half a rule", Map.of("rec_freq", "DAILY"), "calendar_event_recurrence_ck"),
                Arguments.of("an end day and a count", rule("DAILY", Map.of("rec_until_date", day, "rec_count", 3)),
                        "calendar_event_recurrence_ck"),
                Arguments.of("weekly without weekdays", rule("WEEKLY", Map.of()), "calendar_event_recurrence_ck"),
                Arguments.of("weekdays on a daily rule", rule("DAILY", Map.of("rec_by_weekdays", "MONDAY")),
                        "calendar_event_recurrence_ck"),
                Arguments.of("monthly without its day", rule("MONTHLY", Map.of()), "calendar_event_recurrence_ck"),
                Arguments.of("every 100", rule("DAILY", Map.of("rec_interval", 100)), "calendar_event_recurrence_ck"),
                Arguments.of("a count of 1000", rule("DAILY", Map.of("rec_count", 1000)),
                        "calendar_event_recurrence_ck"),
                Arguments.of("notes over 20 000 characters", Map.of("notes", "x".repeat(20_001)),
                        "calendar_event_notes_length_ck"),
                Arguments.of("a title over 200 characters", Map.of("title", "x".repeat(201)), "character varying(200)"),
                Arguments.of("a place over 200 characters", Map.of("location", "x".repeat(201)),
                        "character varying(200)"));
    }

    private static Map<String, Object> rule(String freq, Map<String, Object> changes) {
        Map<String, Object> row = new HashMap<>();
        row.put("rec_freq", freq);
        row.put("rec_interval", 1);
        row.put("rec_time_zone", "Asia/Ho_Chi_Minh");
        row.putAll(changes);
        return row;
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("brokenRows")
    void theDatabaseRefusesAnAppointmentThatBreaksItsRules(String name, Map<String, Object> changes, String refusedBy) {
        assertThatThrownBy(() -> insertRow(changes)).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(refusedBy);
        assertThat(events.count()).isZero();
    }

    @Test
    void theDatabaseTakesAWholeAppointment() {
        Date day = Date.valueOf("2026-10-15");

        insertRow(Map.of());
        insertRow(Map.of("starts_at", "-", "ends_at", "-", "start_date", day, "end_date", Date.valueOf("2026-10-29")));
        insertRow(rule("WEEKLY", Map.of("rec_by_weekdays", "THURSDAY")));
        insertRow(rule("MONTHLY", Map.of("rec_by_month_day", 15, "rec_count", 3)));

        assertThat(events.count()).isEqualTo(4);
    }

    /** A valid timed row with {@code changes} over it; a {@code "-"} value removes that column. */
    private void insertRow(Map<String, Object> changes) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", UUID.randomUUID());
        row.put("user_id", owner);
        row.put("title", "x");
        row.put("starts_at", Timestamp.from(THURSDAY_10));
        row.put("ends_at", Timestamp.from(THURSDAY_10.plusSeconds(3600)));
        row.put("created_at", Timestamp.from(FRIDAY));
        row.put("updated_at", Timestamp.from(FRIDAY));
        row.put("version", 0);
        row.putAll(changes);
        row.values().removeIf("-"::equals);
        String sql = "insert into calendar_event (" + String.join(", ", row.keySet()) + ") values ("
                + "?, ".repeat(row.size() - 1) + "?)";
        jdbc.update(sql, row.values().toArray());
    }

    @Test
    void storesReplacesAndRemovesTheReminder() {
        CalendarEvent event = service.create(owner,
                new NewEvent("Họp", null, null, meeting(), null, new Reminder(15), false));
        assertThat(events.findById(event.id()).orElseThrow().reminder()).isEqualTo(new Reminder(15));

        service.replace(owner, event.id(), new NewEvent("Họp", null, null, meeting(), null, new Reminder(60), false));
        assertThat(events.findById(event.id()).orElseThrow().reminder()).isEqualTo(new Reminder(60));

        service.replace(owner, event.id(), new NewEvent("Họp", null, null, meeting(), null));
        assertThat(events.findById(event.id()).orElseThrow().reminder()).isNull();
    }

    @Test
    void aNewTimedAppointmentWithoutAReminderTakesTheDefaultOfTheSettings() {
        when(settings.defaultReminderMinutes(owner)).thenReturn(Optional.of(30));

        CalendarEvent event = service.create(owner, new NewEvent("Họp", null, null, meeting(), null, null, true));

        assertThat(events.findById(event.id()).orElseThrow().reminder()).isEqualTo(new Reminder(30));
    }

    @Test
    void theDefaultOnlyFillsAMissingReminderOfATimedAppointment() {
        when(settings.defaultReminderMinutes(owner)).thenReturn(Optional.of(30));
        EventTime birthday = EventTime.wholeDays(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-02"));
        CalendarEvent none = service.create(owner, new NewEvent("Họp", null, null, meeting(), null, null, false));
        CalendarEvent wholeDay = service.create(owner, new NewEvent("Sinh nhật", null, null, birthday, null, null, true));
        when(settings.defaultReminderMinutes(owner)).thenReturn(Optional.of(10));
        CalendarEvent unsupported = service.create(owner,
                new NewEvent("Họp 2", null, null, meeting(), null, null, true));

        assertThat(events.findById(none.id()).orElseThrow().reminder()).isNull();
        assertThat(events.findById(wholeDay.id()).orElseThrow().reminder()).isNull();
        assertThat(events.findById(unsupported.id()).orElseThrow().reminder()).isNull();
    }

    @Test
    void aReminderThatDoesNotFitTheTimeOfTheAppointmentIsRefusedAndNothingIsStored() {
        assertThatThrownBy(() -> service.create(owner, new NewEvent("Họp", null, null, meeting(), null,
                new Reminder(900), false))).isInstanceOf(IllegalArgumentException.class);

        assertThat(events.findAll()).isEmpty();
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
