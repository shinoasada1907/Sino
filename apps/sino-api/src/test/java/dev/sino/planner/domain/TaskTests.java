package dev.sino.planner.domain;

import static java.time.DayOfWeek.MONDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.common.error.SinoException;

class TaskTests {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final UUID OWNER = UUID.fromString("00000000-0000-7000-8000-000000000001");
    private static final Instant NOW = Instant.parse("2026-10-02T07:05:00Z");

    private static final Recurrence MONDAYS = new Recurrence(Frequency.WEEKLY, 1, Set.of(MONDAY), null, null, null,
            VIETNAM);

    private static Task task(String title, Due due, Recurrence recurrence) {
        return Task.create(OWNER, title, null, due, recurrence, NOW);
    }

    @Test
    void aNewTaskIsOpenWithATrimmedTitle() {
        Task task = Task.create(OWNER, "  Gọi điện cho thợ sửa máy lạnh  ", "Hỏi giá trước", null, null, NOW);

        assertThat(task.title()).isEqualTo("Gọi điện cho thợ sửa máy lạnh");
        assertThat(task.notes()).isEqualTo("Hỏi giá trước");
        assertThat(task.status()).isEqualTo(TaskStatus.OPEN);
        assertThat(task.due()).isNull();
        assertThat(task.createdAt()).isEqualTo(NOW);
        assertThat(task.completedAt()).isNull();
    }

    @Test
    void theTitleIsNotEmptyAndAtMost200Characters() {
        assertThatIllegalArgumentException().isThrownBy(() -> task("   ", null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> task("x".repeat(201), null, null));
        assertThat(task("x".repeat(200), null, null).title()).hasSize(200);
    }

    @Test
    void blankNotesAreNoNotesAndLongNotesAreRefused() {
        assertThat(Task.create(OWNER, "A", "  \n ", null, null, NOW).notes()).isNull();
        assertThatIllegalArgumentException()
                .isThrownBy(() -> Task.create(OWNER, "A", "x".repeat(20_001), null, null, NOW));
        assertThat(Task.create(OWNER, "A", "x".repeat(20_000), null, null, NOW).notes()).hasSize(20_000);
    }

    @Test
    void aRepeatRuleNeedsADue() {
        assertThatIllegalArgumentException().isThrownBy(() -> task("Báo cáo tuần", null, MONDAYS));
    }

    @Test
    void completesOnceAndReopens() {
        Task task = task("Báo cáo tuần", null, null);
        Instant later = NOW.plusSeconds(60);

        assertThat(task.complete(later)).isTrue();
        assertThat(task.status()).isEqualTo(TaskStatus.DONE);
        assertThat(task.completedAt()).isEqualTo(later);
        assertThat(task.complete(later.plusSeconds(60))).isFalse();
        assertThat(task.completedAt()).isEqualTo(later);

        assertThat(task.reopen(later)).isTrue();
        assertThat(task.status()).isEqualTo(TaskStatus.OPEN);
        assertThat(task.completedAt()).isNull();
        assertThat(task.reopen(later)).isFalse();
    }

    @Test
    void theNextOccurrenceKeepsTheLocalTimeTitleNotesAndRule() {
        // Monday 05/10 9:00 in Vietnam, done on Wednesday 07/10.
        Task task = Task.create(OWNER, "Báo cáo tuần", "Gửi chị Lan", Due.at(Instant.parse("2026-10-05T02:00:00Z")),
                MONDAYS, NOW);
        Instant doneAt = Instant.parse("2026-10-07T03:00:00Z");
        task.complete(doneAt);

        Task next = task.makeNextOccurrence(doneAt).orElseThrow();

        assertThat(next.due()).isEqualTo(Due.at(Instant.parse("2026-10-12T02:00:00Z")));
        assertThat(next.title()).isEqualTo("Báo cáo tuần");
        assertThat(next.notes()).isEqualTo("Gửi chị Lan");
        assertThat(next.recurrence()).isEqualTo(MONDAYS);
        assertThat(next.status()).isEqualTo(TaskStatus.OPEN);
        assertThat(next.occurrenceIndex()).isEqualTo(1);
        assertThat(next.seriesId()).isNotNull().isEqualTo(task.seriesId());
        assertThat(next.ownerId()).isEqualTo(OWNER);
        assertThat(next.createdAt()).isEqualTo(doneAt);
    }

    @Test
    void theNextOccurrenceOfAnAllDayTaskIsAnAllDayTask() {
        Recurrence on31 = new Recurrence(Frequency.MONTHLY, 1, null, 31, null, null, VIETNAM);
        Task task = task("Trả tiền nhà", Due.on(LocalDate.parse("2026-10-31")), on31);

        Task next = task.makeNextOccurrence(Instant.parse("2026-10-31T05:00:00Z")).orElseThrow();

        assertThat(next.due()).isEqualTo(Due.on(LocalDate.parse("2026-11-30")));
        assertThat(next.recurrence().byMonthDay()).isEqualTo(31);
    }

    @Test
    void missedOccurrencesAreSkippedButCounted() {
        Task task = task("Báo cáo tuần", Due.at(Instant.parse("2026-10-05T02:00:00Z")), MONDAYS);

        Task next = task.makeNextOccurrence(Instant.parse("2026-10-21T03:00:00Z")).orElseThrow();

        assertThat(next.due()).isEqualTo(Due.at(Instant.parse("2026-10-26T02:00:00Z")));
        assertThat(next.occurrenceIndex()).isEqualTo(3);
    }

    @Test
    void todayIsTheDayInTheZoneOfTheRule() {
        Recurrence everyDay = new Recurrence(Frequency.DAILY, 1, null, null, null, null, VIETNAM);
        Task task = task("Uống thuốc", Due.on(LocalDate.parse("2026-10-01")), everyDay);

        // 18:00 UTC on the 4th is already 01:00 on the 5th in Vietnam.
        Task next = task.makeNextOccurrence(Instant.parse("2026-10-04T18:00:00Z")).orElseThrow();

        assertThat(next.due()).isEqualTo(Due.on(LocalDate.parse("2026-10-05")));
    }

    @Test
    void noNextOccurrenceWithoutARuleOrAfterTheLastOne() {
        Recurrence twice = new Recurrence(Frequency.DAILY, 1, null, null, null, 2, VIETNAM);
        Task task = task("Uống thuốc", Due.on(LocalDate.parse("2026-10-01")), twice);
        Task second = task.makeNextOccurrence(NOW).orElseThrow();

        assertThat(task("Không lặp", Due.on(LocalDate.parse("2026-10-01")), null).makeNextOccurrence(NOW)).isEmpty();
        assertThat(second.makeNextOccurrence(NOW)).isEmpty();
    }

    @Test
    void aNewRuleMakesTheTaskTheFirstOfItsSeriesAndRemovingItKeepsTheSeries() {
        Recurrence everyDay = new Recurrence(Frequency.DAILY, 1, null, null, null, null, VIETNAM);
        Task first = task("Uống thuốc", Due.on(LocalDate.parse("2026-10-01")), everyDay);
        Task third = first.makeNextOccurrence(Instant.parse("2026-10-03T03:00:00Z")).orElseThrow();
        assertThat(third.occurrenceIndex()).isEqualTo(2);

        third.reschedule(Due.on(LocalDate.parse("2026-10-10")), everyDay, NOW);
        assertThat(third.occurrenceIndex()).isZero();
        assertThat(third.seriesId()).isEqualTo(first.seriesId());

        third.reschedule(null, null, NOW);
        assertThat(third.due()).isNull();
        assertThat(third.recurrence()).isNull();
        assertThat(third.seriesId()).isEqualTo(first.seriesId());
    }

    @Test
    void aRescheduleWithARuleNeedsADue() {
        Task task = task("Báo cáo tuần", null, null);

        assertThatIllegalArgumentException().isThrownBy(() -> task.reschedule(null, MONDAYS, NOW));
    }

    @Test
    void aRepeatingTaskHasASeriesFromTheStart() {
        assertThat(task("Báo cáo tuần", Due.at(Instant.parse("2026-10-05T02:00:00Z")), MONDAYS).seriesId())
                .isNotNull();
        assertThat(task("Không lặp", Due.at(Instant.parse("2026-10-05T02:00:00Z")), null).seriesId()).isNull();
    }

    @Test
    void aRuleGivenLaterStartsASeriesAndTwoTasksNeverShareOneByChance() {
        Task one = task("Báo cáo tuần", null, null);
        Task other = task("Báo cáo tháng", null, null);

        one.reschedule(Due.at(Instant.parse("2026-10-05T02:00:00Z")), MONDAYS, NOW);
        other.reschedule(Due.at(Instant.parse("2026-10-05T02:00:00Z")), MONDAYS, NOW);

        assertThat(one.seriesId()).isNotNull().isNotEqualTo(other.seriesId());
    }

    @Test
    void theNextOccurrenceIsMadeOnceEvenAfterTheTaskIsOpenedAgain() {
        Task task = task("Báo cáo tuần", Due.at(Instant.parse("2026-10-05T02:00:00Z")), MONDAYS);
        task.complete(NOW);
        assertThat(task.makeNextOccurrence(NOW)).isPresent();

        assertThat(task.makeNextOccurrence(NOW)).isEmpty();
        task.reopen(NOW);
        task.complete(NOW);
        assertThat(task.makeNextOccurrence(NOW)).isEmpty();
    }

    @Test
    void theTaskChecksItsRuleAgainstItsDue() {
        Recurrence monthly = new Recurrence(Frequency.MONTHLY, 1, null, null, null, null, VIETNAM);

        assertThat(task("Trả tiền nhà", Due.on(LocalDate.parse("2026-10-31")), monthly).recurrence().byMonthDay())
                .isEqualTo(31);
        // Wednesday 07/10 is not a Monday.
        assertThatThrownBy(() -> task("Báo cáo tuần", Due.on(LocalDate.parse("2026-10-07")), MONDAYS))
                .isInstanceOfSatisfying(SinoException.class,
                        e -> assertThat(e.errorCode()).isEqualTo(PlannerErrorCode.INVALID_RECURRENCE));
    }

    @Test
    void changesTouchTheUpdateTime() {
        Task task = task("A", null, null);
        Instant later = NOW.plusSeconds(3600);

        task.rename(" B ", later);
        task.changeNotes("Ghi chú", later.plusSeconds(1));

        assertThat(task.title()).isEqualTo("B");
        assertThat(task.notes()).isEqualTo("Ghi chú");
        assertThat(task.updatedAt()).isEqualTo(later.plusSeconds(1));
        assertThat(task.createdAt()).isEqualTo(NOW);
    }

    @Test
    void aDueIsAMomentOrADayNeverBoth() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new Due(Instant.parse("2026-10-05T02:00:00Z"), LocalDate.parse("2026-10-05")));
        assertThatIllegalArgumentException().isThrownBy(() -> new Due(null, null));
        assertThat(Due.at(Instant.parse("2026-10-04T18:00:00Z")).day(VIETNAM)).isEqualTo(LocalDate.parse("2026-10-05"));
        assertThat(Due.on(LocalDate.parse("2026-10-05")).day(VIETNAM)).isEqualTo(LocalDate.parse("2026-10-05"));
    }

}
