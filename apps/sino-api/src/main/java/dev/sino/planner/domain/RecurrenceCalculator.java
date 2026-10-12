package dev.sino.planner.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Works out the occurrences of a {@link Recurrence} on dates only; callers put the time of day on them with
 * {@link Recurrence#instantAt}. A series is seen from one of its occurrences, the anchor: the first date of an event,
 * or the due date of the open task of a repeating series with its place in the series, so the count goes on from
 * there. Nothing is stored: a range jumps straight to its first occurrence instead of walking from the anchor.
 * <p>
 * The anchor must fit the rule ({@link Recurrence#anchoredAt}).
 */
public final class RecurrenceCalculator {

    private RecurrenceCalculator() {
    }

    /** The occurrences from {@code anchor} on whose date is in [{@code from}, {@code to}), in order. */
    public static List<Occurrence> between(Recurrence rule, Occurrence anchor, LocalDate from, LocalDate to) {
        Series series = new Series(rule, anchor);
        List<Occurrence> found = new ArrayList<>();
        for (long step = series.firstOnOrAfter(from); ; step++) {
            LocalDate date = series.dateOf(step);
            if (!date.isBefore(to) || !series.allows(step, date)) {
                return found;
            }
            found.add(series.occurrence(step, date));
        }
    }

    /**
     * The first occurrence after {@code current} whose date is not before {@code today}; the ones skipped still count
     * (spec {@code recurrence}, "Lần kế tiếp sau khi hoàn thành"). Empty when the rule has ended.
     */
    public static Optional<Occurrence> nextAfter(Recurrence rule, Occurrence current, LocalDate today) {
        Series series = new Series(rule, current);
        long step = Math.max(1, series.firstOnOrAfter(today));
        LocalDate date = series.dateOf(step);
        return series.allows(step, date) ? Optional.of(series.occurrence(step, date)) : Optional.empty();
    }

    /** A rule seen from its anchor: step 0 is the anchor, step n the n-th occurrence after it. */
    private static final class Series {

        private final Recurrence rule;
        private final Occurrence anchor;
        private final LocalDate start;
        private final int monthDay;
        private final List<DayOfWeek> weekdays;
        private final LocalDate firstMonday;
        private final int firstWeekSteps;

        Series(Recurrence rule, Occurrence anchor) {
            this.rule = rule;
            this.anchor = anchor;
            this.start = anchor.date();
            this.monthDay = rule.byMonthDay() != null ? rule.byMonthDay() : start.getDayOfMonth();
            this.weekdays = List.copyOf(rule.byWeekdays());
            this.firstMonday = start.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            // Occurrences in the anchor's own week: its weekday and the rule's weekdays after it.
            this.firstWeekSteps = weekdays.size() - Math.max(0, weekdays.indexOf(start.getDayOfWeek()));
        }

        LocalDate dateOf(long step) {
            long every = rule.interval();
            return switch (rule.frequency()) {
                case DAILY -> start.plusDays(step * every);
                case WEEKLY -> weeklyDateOf(step);
                case MONTHLY -> onMonthDay(YearMonth.from(start).plusMonths(step * every));
                case YEARLY -> onMonthDay(YearMonth.from(start).plusYears(step * every));
            };
        }

        private LocalDate weeklyDateOf(long step) {
            int first = weekdays.size() - firstWeekSteps;
            if (step < firstWeekSteps) {
                return firstMonday.plusDays(weekdays.get(first + (int) step).ordinal());
            }
            long later = step - firstWeekSteps;
            long week = 1 + later / weekdays.size();
            DayOfWeek day = weekdays.get((int) (later % weekdays.size()));
            return firstMonday.plusWeeks(week * rule.interval()).plusDays(day.ordinal());
        }

        private LocalDate onMonthDay(YearMonth month) {
            return month.atDay(Math.min(monthDay, month.lengthOfMonth()));
        }

        /** The first step whose date is on or after {@code day}: a jump close to it, then a few steps forward. */
        long firstOnOrAfter(LocalDate day) {
            if (!day.isAfter(start)) {
                return 0;
            }
            long every = rule.interval();
            long step = switch (rule.frequency()) {
                case DAILY -> Math.ceilDiv(ChronoUnit.DAYS.between(start, day), every);
                case WEEKLY -> {
                    long period = ChronoUnit.WEEKS.between(firstMonday, day) / every;
                    yield period == 0 ? 0 : firstWeekSteps + (period - 1) * weekdays.size();
                }
                case MONTHLY -> ChronoUnit.MONTHS.between(YearMonth.from(start), YearMonth.from(day)) / every;
                case YEARLY -> (day.getYear() - start.getYear()) / every;
            };
            while (dateOf(step).isBefore(day)) {
                step++;
            }
            return step;
        }

        boolean allows(long step, LocalDate date) {
            boolean withinCount = rule.count() == null || anchor.index() + step < rule.count();
            boolean withinDays = rule.untilDate() == null || !date.isAfter(rule.untilDate());
            return withinCount && withinDays;
        }

        Occurrence occurrence(long step, LocalDate date) {
            return new Occurrence(Math.toIntExact(anchor.index() + step), date);
        }

    }

}
