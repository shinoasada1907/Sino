package dev.sino.planner.api;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

import org.springframework.format.annotation.DateTimeFormat;

import dev.sino.planner.application.CalendarService;

/**
 * The query of {@code GET /api/calendar}: the days {@code from} (included) to {@code to} (not included), in Sino's
 * time zone (D-155). At most {@value CalendarService#MAX_DAYS} days, and inside the years 1900 to 2200.
 */
record CalendarQuery(
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

    @AssertTrue(message = "to must be after from")
    boolean isToAfterFrom() {
        return from == null || to == null || to.isAfter(from);
    }

    @AssertTrue(message = "the range is at most " + CalendarService.MAX_DAYS + " days")
    boolean isShortEnough() {
        return from == null || to == null || !to.isAfter(from) || ChronoUnit.DAYS.between(from, to) <= CalendarService.MAX_DAYS;
    }

    @AssertTrue(message = "the range is within the years 1900 to 2200")
    boolean isWithinSupportedYears() {
        return (from == null || !from.isBefore(CalendarService.EARLIEST))
                && (to == null || !to.isAfter(CalendarService.LATEST));
    }

}
