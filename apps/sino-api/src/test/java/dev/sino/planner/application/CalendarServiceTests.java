package dev.sino.planner.application;

import static java.time.DayOfWeek.MONDAY;
import static java.time.DayOfWeek.SATURDAY;
import static java.time.DayOfWeek.SUNDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.ApplicationModuleTest.BootstrapMode;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.jdbc.JdbcTestUtils;

import dev.sino.TestcontainersConfiguration;
import dev.sino.planner.application.CalendarView.EventOccurrence;
import dev.sino.planner.application.CalendarView.TaskOccurrence;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.EventTime;
import dev.sino.planner.domain.Frequency;
import dev.sino.planner.domain.Task;
import dev.sino.planner.domain.TaskStatus;

/**
 * Module test of the calendar (spec {@code calendar}, "Xem lịch theo khoảng ngày") on a real PostgreSQL. Today is
 * Friday 02/10/2026 in Vietnam, the time of the canvas, as in the scenarios of the spec.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, CalendarServiceTests.Clocks.class })
@ActiveProfiles("test")
class CalendarServiceTests {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Instant FRIDAY = Instant.parse("2026-10-02T07:05:00Z");
    private static final RepeatRule SUNDAYS = new RepeatRule(Frequency.WEEKLY, 1, Set.of(SUNDAY), null, null, null);
    private static final RepeatRule MONDAYS = new RepeatRule(Frequency.WEEKLY, 1, Set.of(MONDAY), null, null, null);

    @Autowired
    private CalendarService calendar;

    @Autowired
    private EventService eventService;

    @Autowired
    private TaskService taskService;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        JdbcTestUtils.deleteFromTables(jdbc, "calendar_event", "task", "app_user");
        owner = insertUser("owner@sino.test");
    }

    /** Other tests delete users; a row left here would stop them. */
    @AfterEach
    void leaveNoRows() {
        JdbcTestUtils.deleteFromTables(jdbc, "calendar_event", "task");
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", id, email);
        return id;
    }

    /** A moment given as local time in Vietnam, for example {@code "2026-10-04T06:00"}. */
    private static Instant vn(String local) {
        return LocalDateTime.parse(local).atZone(VIETNAM).toInstant();
    }

    private static LocalDate day(String date) {
        return LocalDate.parse(date);
    }

    private CalendarEvent event(String title, EventTime time, RepeatRule repeat) {
        return eventService.create(owner, new NewEvent(title, null, null, time, repeat));
    }

    private Task task(String title, Due due, RepeatRule repeat) {
        return taskService.create(owner, new NewTask(title, null, due, repeat));
    }

    private CalendarView view(String from, String to) {
        return calendar.view(owner, day(from), day(to));
    }

    private static List<String> eventIds(CalendarView view) {
        return view.events().stream().map(EventOccurrence::id).toList();
    }

    private static List<String> taskIds(CalendarView view) {
        return view.tasks().stream().map(TaskOccurrence::id).toList();
    }

    @Test
    void aRepeatingAppointmentShowsItsOccurrenceInTheWeek() {
        // Every Sunday 06:00 from 06/09; the week is [28/09, 05/10).
        CalendarEvent run = event("Chạy bộ Hồ Tây", EventTime.timed(vn("2026-09-06T06:00"), vn("2026-09-06T07:00")),
                SUNDAYS);

        CalendarView week = view("2026-09-28", "2026-10-05");

        assertThat(week.events()).hasSize(1);
        EventOccurrence only = week.events().getFirst();
        assertThat(only.id()).isEqualTo(run.id() + "@2026-10-04");
        assertThat(only.time().startsAt()).isEqualTo(vn("2026-10-04T06:00"));
        assertThat(only.time().endsAt()).isEqualTo(vn("2026-10-04T07:00"));
        assertThat(only.event().id()).isEqualTo(run.id());
        assertThat(week.generatedAt()).isEqualTo(FRIDAY);
        assertThat(week.from()).isEqualTo(day("2026-09-28"));
        assertThat(week.to()).isEqualTo(day("2026-10-05"));
    }

    @Test
    void anAppointmentThatBeganBeforeTheRangeAndReachesIntoItIsThere() {
        CalendarEvent trip = event("Công tác", EventTime.wholeDays(day("2026-09-26"), day("2026-09-30")), null);

        assertThat(eventIds(view("2026-09-28", "2026-10-05"))).containsExactly(trip.id() + "@2026-09-26");
    }

    @Test
    void anOccurrenceOfARepeatingAppointmentThatBeganBeforeTheRangeIsThere() {
        // A three-day appointment every Saturday: the one of 26/09 lasts through Monday 28/09.
        CalendarEvent camp = event("Cắm trại", EventTime.wholeDays(day("2026-09-12"), day("2026-09-15")),
                new RepeatRule(Frequency.WEEKLY, 1, Set.of(SATURDAY), null, null, null));

        CalendarView week = view("2026-09-28", "2026-10-05");

        assertThat(eventIds(week)).containsExactly(camp.id() + "@2026-09-26", camp.id() + "@2026-10-03");
        assertThat(week.events().getFirst().time().endDate()).isEqualTo(day("2026-09-29"));
    }

    @Test
    void aTimedOccurrenceThatCrossesMidnightIntoTheRangeIsThere() {
        // Every Sunday 22:00 to 02:00 Monday: the one of 27/09 ends at 02:00 on 28/09.
        CalendarEvent night = event("Trực đêm", EventTime.timed(vn("2026-09-06T22:00"), vn("2026-09-07T02:00")),
                SUNDAYS);

        assertThat(eventIds(view("2026-09-28", "2026-10-05"))).containsExactly(night.id() + "@2026-09-27",
                night.id() + "@2026-10-04");
    }

    @Test
    void theRangeEndsBeforeItsLastDayAndAnAppointmentEndingWhenItStartsIsOut() {
        event("Kết thúc đúng lúc from", EventTime.timed(vn("2026-09-27T23:00"), vn("2026-09-28T00:00")), null);
        event("Bắt đầu đúng lúc to", EventTime.timed(vn("2026-10-05T00:00"), vn("2026-10-05T01:00")), null);
        event("Cả ngày kết thúc đúng from", EventTime.wholeDays(day("2026-09-27"), day("2026-09-28")), null);
        event("Cả ngày bắt đầu đúng to", EventTime.wholeDays(day("2026-10-05"), day("2026-10-06")), null);
        CalendarEvent inside = event("Một phút đầu", EventTime.timed(vn("2026-09-27T23:59"), vn("2026-09-28T00:01")),
                null);
        CalendarEvent lastMinute = event("Một phút cuối", EventTime.timed(vn("2026-10-04T23:59"),
                vn("2026-10-05T00:30")), null);

        assertThat(eventIds(view("2026-09-28", "2026-10-05"))).containsExactly(inside.id() + "@2026-09-27",
                lastMinute.id() + "@2026-10-04");
    }

    @Test
    void aRepeatingAppointmentEndsAtItsCountAndItsEndDay() {
        CalendarEvent twice = event("Hai lần", EventTime.timed(vn("2026-10-04T06:00"), vn("2026-10-04T07:00")),
                new RepeatRule(Frequency.WEEKLY, 1, Set.of(SUNDAY), null, null, 2));
        CalendarEvent untilTheEleventh = event("Tới 11/10", EventTime.timed(vn("2026-10-04T08:00"),
                vn("2026-10-04T09:00")), new RepeatRule(Frequency.WEEKLY, 1, Set.of(SUNDAY), null, day("2026-10-11"),
                        null));

        assertThat(eventIds(view("2026-10-01", "2026-11-01"))).containsExactly(twice.id() + "@2026-10-04",
                untilTheEleventh.id() + "@2026-10-04", twice.id() + "@2026-10-11",
                untilTheEleventh.id() + "@2026-10-11");
    }

    @Test
    void aRepeatingAppointmentThatStartsAfterTheRangeIsNotThere() {
        event("Sau này", EventTime.timed(vn("2026-12-06T06:00"), vn("2026-12-06T07:00")), SUNDAYS);

        assertThat(view("2026-09-28", "2026-10-05").events()).isEmpty();
    }

    @Test
    void eventsComeInTheOrderTheyStart() {
        CalendarEvent late = event("Muộn", EventTime.timed(vn("2026-10-01T15:00"), vn("2026-10-01T16:00")), null);
        CalendarEvent wholeDay = event("Cả ngày", EventTime.wholeDays(day("2026-10-01"), day("2026-10-02")), null);
        CalendarEvent early = event("Sớm", EventTime.timed(vn("2026-10-01T08:00"), vn("2026-10-01T09:00")), null);

        assertThat(eventIds(view("2026-10-01", "2026-10-02"))).containsExactly(wholeDay.id() + "@2026-10-01",
                early.id() + "@2026-10-01", late.id() + "@2026-10-01");
    }

    @Test
    void anOpenTaskLateFromBeforeShowsWhenTheRangeHoldsToday() {
        Task invoice = task("Gửi lại hóa đơn tháng 9", Due.on(day("2026-09-30")), null);

        assertThat(taskIds(view("2026-10-01", "2026-10-15"))).containsExactly(invoice.id().toString());
    }

    @Test
    void aLateTaskIsNotInARangeThatDoesNotHoldToday() {
        task("Gửi lại hóa đơn tháng 9", Due.on(day("2026-09-30")), null);

        assertThat(view("2026-10-05", "2026-10-12").tasks()).isEmpty();
        assertThat(view("2026-09-01", "2026-09-29").tasks()).isEmpty();
    }

    @Test
    void aDoneTaskIsOnlyInTheRangeOfItsDue() {
        Task done = task("Đã xong", Due.on(day("2026-09-30")), null);
        taskService.complete(owner, done.id());

        assertThat(view("2026-10-01", "2026-10-15").tasks()).isEmpty();
        CalendarView rangeOfItsDue = view("2026-09-28", "2026-10-05");
        assertThat(rangeOfItsDue.tasks()).singleElement().satisfies(t -> {
            assertThat(t.status()).isEqualTo(TaskStatus.DONE);
            assertThat(t.completedAt()).isEqualTo(FRIDAY);
        });
    }

    @Test
    void aTaskIsInTheRangeFromItsFirstDayAndNotOnTheLast() {
        Task first = task("Ngày đầu", Due.on(day("2026-10-05")), null);
        task("Ngày cuối", Due.on(day("2026-10-12")), null);
        Task atTheStart = task("Đúng lúc from", Due.at(vn("2026-10-05T00:00")), null);
        task("Đúng lúc to", Due.at(vn("2026-10-12T00:00")), null);
        Task lastMinute = task("Phút cuối", Due.at(vn("2026-10-11T23:59")), null);

        assertThat(taskIds(view("2026-10-05", "2026-10-12"))).containsExactlyInAnyOrder(first.id().toString(),
                atTheStart.id().toString(), lastMinute.id().toString());
    }

    @Test
    void aTaskWithoutADueIsNeverThere() {
        task("Không hạn", null, null);

        assertThat(view("2026-10-01", "2026-10-15").tasks()).isEmpty();
    }

    @Test
    void aRepeatingTaskShowsItsComingOccurrences() {
        // Due Monday 05/10 9:00, every Monday; the month is October.
        Task report = task("Báo cáo tuần", Due.at(vn("2026-10-05T09:00")), MONDAYS);

        CalendarView october = view("2026-10-01", "2026-11-01");

        assertThat(taskIds(october)).containsExactly(report.id().toString(), report.id() + "@2026-10-12",
                report.id() + "@2026-10-19", report.id() + "@2026-10-26");
        assertThat(october.tasks()).extracting(TaskOccurrence::taskId).containsOnly(report.id());
        TaskOccurrence coming = october.tasks().get(1);
        assertThat(coming.due()).isEqualTo(Due.at(vn("2026-10-12T09:00")));
        assertThat(coming.status()).isEqualTo(TaskStatus.OPEN);
        assertThat(coming.completedAt()).isNull();
        assertThat(coming.recurrence().frequency()).isEqualTo(Frequency.WEEKLY);
    }

    @Test
    void aRepeatingTaskOfWholeDaysShowsItsComingOccurrencesAsDays() {
        Task report = task("Báo cáo tuần", Due.on(day("2026-10-05")), MONDAYS);

        assertThat(view("2026-10-06", "2026-10-20").tasks()).extracting(TaskOccurrence::id)
                .containsExactly(report.id() + "@2026-10-12", report.id() + "@2026-10-19");
        assertThat(view("2026-10-06", "2026-10-20").tasks().getFirst().due()).isEqualTo(Due.on(day("2026-10-12")));
    }

    @Test
    void theComingOccurrencesOfAPastTaskStartAtToday() {
        // Due Monday 07/09, every Monday, still open: it is late itself, 28/09 is before today and is not shown,
        // 05/10 is.
        Task late = task("Báo cáo tuần", Due.at(vn("2026-09-07T09:00")), MONDAYS);

        CalendarView view = view("2026-09-28", "2026-10-12");

        assertThat(taskIds(view)).containsExactly(late.id().toString(), late.id() + "@2026-10-05");
    }

    @Test
    void theComingOccurrencesStopAtTheCountAndTheEndDay() {
        Task twice = task("Hai lần", Due.at(vn("2026-10-05T09:00")),
                new RepeatRule(Frequency.WEEKLY, 1, Set.of(MONDAY), null, null, 2));
        Task untilThe19th = task("Tới 19/10", Due.at(vn("2026-10-05T10:00")),
                new RepeatRule(Frequency.WEEKLY, 1, Set.of(MONDAY), null, day("2026-10-19"), null));

        assertThat(taskIds(view("2026-10-01", "2026-11-01"))).containsExactly(twice.id().toString(),
                untilThe19th.id().toString(), twice.id() + "@2026-10-12", untilThe19th.id() + "@2026-10-12",
                untilThe19th.id() + "@2026-10-19");
    }

    @Test
    void aTaskThatMadeItsNextOccurrenceStandsForNoComingOnes() {
        // Done and opened again: 05/10 stays open, the real 12/10 exists, and 12/10 stands for 19/10 and 26/10.
        Task report = task("Báo cáo tuần", Due.at(vn("2026-10-05T09:00")), MONDAYS);
        Task next = taskService.complete(owner, report.id()).next();
        taskService.reopen(owner, report.id());

        CalendarView october = view("2026-10-01", "2026-11-01");

        assertThat(taskIds(october)).containsExactly(report.id().toString(), next.id().toString(),
                next.id() + "@2026-10-19", next.id() + "@2026-10-26");
    }

    @Test
    void aDoneRepeatingTaskStandsForNoComingOnesAndItsNextOneDoes() {
        Task report = task("Báo cáo tuần", Due.at(vn("2026-10-05T09:00")), MONDAYS);
        Task next = taskService.complete(owner, report.id()).next();

        CalendarView october = view("2026-10-01", "2026-11-01");

        assertThat(taskIds(october)).containsExactly(report.id().toString(), next.id().toString(),
                next.id() + "@2026-10-19", next.id() + "@2026-10-26");
        assertThat(october.tasks().getFirst().status()).isEqualTo(TaskStatus.DONE);
    }

    @Test
    void anotherUserSeesNothingOfIt() {
        UUID someoneElse = insertUser("other@sino.test");
        eventService.create(someoneElse, new NewEvent("Của người khác",
                null, null, EventTime.timed(vn("2026-10-04T06:00"), vn("2026-10-04T07:00")), SUNDAYS));
        taskService.create(someoneElse, new NewTask("Việc của người khác", null, Due.on(day("2026-09-28")), MONDAYS));

        CalendarView mine = view("2026-09-28", "2026-10-12");

        assertThat(mine.events()).isEmpty();
        assertThat(mine.tasks()).isEmpty();
        assertThat(calendar.view(someoneElse, day("2026-09-28"), day("2026-10-12")).events()).hasSize(2);
    }

    @Test
    void aRangeOfSixtyTwoDaysIsServedAndSixtyThreeIsNot() {
        assertThat(view("2026-10-01", "2026-12-02").from()).isEqualTo(day("2026-10-01"));

        assertThatThrownBy(() -> view("2026-10-01", "2026-12-03")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aRangeOutsideTheSupportedYearsOrEmptyIsRefused() {
        assertThatThrownBy(() -> view("1899-12-30", "1900-01-05")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> view("2200-12-30", "2201-01-02")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> view("2026-10-05", "2026-10-05")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> view("2026-10-06", "2026-10-05")).isInstanceOf(IllegalArgumentException.class);
        // The edges of the supported years are served.
        assertThat(view("1900-01-01", "1900-01-05").events()).isEmpty();
        assertThat(view("2200-12-28", "2201-01-01").events()).isEmpty();
    }

    /** The clock of these tests: Friday 02/10/2026. */
    @TestConfiguration(proxyBeanMethods = false)
    static class Clocks {

        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(FRIDAY, ZoneOffset.UTC);
        }

    }

}
