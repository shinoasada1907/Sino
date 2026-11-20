package dev.sino.planner.domain;

import static java.time.DayOfWeek.THURSDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class ReminderTimesTests {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final UUID OWNER = UUID.fromString("00000000-0000-7000-8000-000000000001");
    // Wednesday 18/11/2026 18:00 in Vietnam.
    private static final Instant NOW = Instant.parse("2026-11-18T11:00:00Z");
    // Thursday 12/11/2026 10:00 in Vietnam.
    private static final Instant THURSDAY_12 = Instant.parse("2026-11-12T03:00:00Z");
    private static final Recurrence THURSDAYS = new Recurrence(Frequency.WEEKLY, 1, Set.of(THURSDAY), null, null, null,
            VIETNAM);

    private static CalendarEvent timed(Instant start, Recurrence rule, Integer offset) {
        CalendarEvent event = CalendarEvent.create(OWNER, "Họp", null, null,
                EventTime.timed(start, start.plusSeconds(3600)), rule, NOW);
        event.changeReminder(offset == null ? null : new Reminder(offset), NOW);
        return event;
    }

    private static ReminderOccurrence occurrence(String date, String at) {
        return new ReminderOccurrence(LocalDate.parse(date), Instant.parse(at));
    }

    @Test
    void anEventWithoutAReminderHasNoReminderTime() {
        assertThat(ReminderTimes.next(timed(THURSDAY_12, null, null), VIETNAM, NOW)).isNull();
    }

    @Test
    void aSingleEventAnswersWithItsOwnReminderEvenWhenPast() {
        CalendarEvent upcoming = timed(Instant.parse("2026-12-20T03:00:00Z"), null, 15);
        CalendarEvent past = timed(Instant.parse("2026-11-01T03:00:00Z"), null, 0);

        assertThat(ReminderTimes.next(upcoming, VIETNAM, NOW)).isEqualTo(occurrence("2026-12-20", "2026-12-20T02:45:00Z"));
        assertThat(ReminderTimes.next(past, VIETNAM, NOW)).isEqualTo(occurrence("2026-11-01", "2026-11-01T03:00:00Z"));
    }

    @Test
    void aWholeDayEventRemindsAtNineTheDayBefore() {
        CalendarEvent event = CalendarEvent.create(OWNER, "Sinh nhật", null, null,
                EventTime.wholeDays(LocalDate.parse("2026-12-20"), LocalDate.parse("2026-12-21")), null, NOW);
        event.changeReminder(new Reminder(900), NOW);

        assertThat(ReminderTimes.next(event, VIETNAM, NOW)).isEqualTo(occurrence("2026-12-20", "2026-12-19T02:00:00Z"));
    }

    @Test
    void aRepeatingEventAnswersWithTheFirstOccurrenceWhoseReminderIsNotPast() {
        CalendarEvent event = timed(THURSDAY_12, THURSDAYS, 15);

        // Wednesday 18/11: the next one is Thursday 19/11 09:45.
        assertThat(ReminderTimes.next(event, VIETNAM, NOW)).isEqualTo(occurrence("2026-11-19", "2026-11-19T02:45:00Z"));
        // At the very moment of the reminder it is still this one; a second later it is next week's.
        Instant atReminder = Instant.parse("2026-11-19T02:45:00Z");
        assertThat(ReminderTimes.next(event, VIETNAM, atReminder)).isEqualTo(
                occurrence("2026-11-19", "2026-11-19T02:45:00Z"));
        assertThat(ReminderTimes.next(event, VIETNAM, atReminder.plusSeconds(1))).isEqualTo(
                occurrence("2026-11-26", "2026-11-26T02:45:00Z"));
    }

    @Test
    void aRepeatingEventStartingInTheFutureAnswersWithItsFirstOccurrence() {
        CalendarEvent event = timed(Instant.parse("2026-11-26T03:00:00Z"), THURSDAYS, 60);

        assertThat(ReminderTimes.next(event, VIETNAM, NOW)).isEqualTo(occurrence("2026-11-26", "2026-11-26T02:00:00Z"));
    }

    @Test
    void aReminderThatReachesBackIntoThePreviousDayStillFindsTheOccurrence() {
        // Thursday 19/11 10:00, reminded a day before: Wednesday 18/11 10:00 is already past at 18:00,
        // so the answer is the next Thursday, 26/11, reminded on Wednesday 25/11 10:00.
        CalendarEvent event = timed(THURSDAY_12, THURSDAYS, 1440);

        assertThat(ReminderTimes.next(event, VIETNAM, NOW)).isEqualTo(occurrence("2026-11-26", "2026-11-25T03:00:00Z"));
    }

    @Test
    void anEndedSeriesFallsBackToItsFirstOccurrence() {
        Recurrence twice = new Recurrence(Frequency.WEEKLY, 1, Set.of(THURSDAY), null, null, 2, VIETNAM);
        CalendarEvent event = timed(THURSDAY_12, twice, 15);

        ReminderOccurrence next = ReminderTimes.next(event, VIETNAM, Instant.parse("2026-11-25T00:00:00Z"));

        assertThat(next).isEqualTo(occurrence("2026-11-12", "2026-11-12T02:45:00Z"));
    }

    @Test
    void aTaskAnswersWithItsOwnReminder() {
        Task timedTask = Task.create(OWNER, "Nộp báo cáo", null, Due.at(Instant.parse("2026-12-20T03:00:00Z")), null,
                NOW);
        timedTask.changeReminder(new Reminder(30), NOW);
        Task dayTask = Task.create(OWNER, "Mua quà", null, Due.on(LocalDate.parse("2026-12-20")), null, NOW);
        dayTask.changeReminder(new Reminder(-540), NOW);
        Task none = Task.create(OWNER, "Không nhắc", null, Due.on(LocalDate.parse("2026-12-20")), null, NOW);

        assertThat(ReminderTimes.next(timedTask, VIETNAM)).isEqualTo(occurrence("2026-12-20", "2026-12-20T02:30:00Z"));
        assertThat(ReminderTimes.next(dayTask, VIETNAM)).isEqualTo(occurrence("2026-12-20", "2026-12-20T02:00:00Z"));
        assertThat(ReminderTimes.next(none, VIETNAM)).isNull();
    }

    @Test
    void aReminderMustFitTheKindOfTime() {
        CalendarEvent event = timed(THURSDAY_12, null, 15);
        Task noDue = Task.create(OWNER, "Không hạn", null, null, null, NOW);

        assertThatIllegalArgumentException().isThrownBy(() -> event.changeReminder(new Reminder(900), NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> noDue.changeReminder(new Reminder(15), NOW));
    }

    @Test
    void changingTheTimeToAnotherKindDropsAReminderThatNoLongerFits() {
        CalendarEvent event = timed(THURSDAY_12, null, 15);
        EventTime wholeDay = EventTime.wholeDays(LocalDate.parse("2026-12-20"), LocalDate.parse("2026-12-21"));
        Task task = Task.create(OWNER, "Nộp", null, Due.at(THURSDAY_12), null, NOW);
        task.changeReminder(new Reminder(15), NOW);

        event.replace("Họp", null, null, wholeDay, null, NOW);
        task.reschedule(Due.on(LocalDate.parse("2026-12-20")), null, NOW);

        assertThat(event.reminder()).isNull();
        assertThat(task.reminder()).isNull();
    }

    @Test
    void theNextOccurrenceOfARepeatingTaskKeepsTheReminder() {
        Recurrence daily = new Recurrence(Frequency.DAILY, 1, Set.of(), null, null, null, VIETNAM);
        Task task = Task.create(OWNER, "Uống thuốc", null, Due.at(Instant.parse("2026-11-18T13:00:00Z")), daily, NOW);
        task.changeReminder(new Reminder(30), NOW);
        task.complete(NOW);

        Task next = task.makeNextOccurrence(NOW).orElseThrow();

        assertThat(next.reminder()).isEqualTo(new Reminder(30));
    }

}
