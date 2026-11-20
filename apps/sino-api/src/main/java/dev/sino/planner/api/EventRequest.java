package dev.sino.planner.api;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import tools.jackson.databind.JsonNode;

import dev.sino.planner.application.NewEvent;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.EventTime;
import dev.sino.planner.domain.Reminder;

/**
 * Body of {@code POST /api/events} and {@code PUT /api/events/{id}} (the {@code PUT} replaces the whole appointment,
 * D-153): a title and a time, which is {@code startsAt} + {@code endsAt} or {@code startDate} + {@code endDate} (the
 * end not included), and maybe a place, notes and a repeat rule whose first date is the start.
 */
record EventRequest(
        @NotBlank @Size(max = CalendarEvent.MAX_TITLE_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String title,
        Instant startsAt,
        Instant endsAt,
        LocalDate startDate,
        LocalDate endDate,
        @Size(max = CalendarEvent.MAX_LOCATION_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String location,
        @Size(max = CalendarEvent.MAX_NOTES_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String notes,
        @Valid RepeatBody recurrence,
        JsonNode reminder) {

    private boolean timed() {
        return startsAt != null && endsAt != null && startDate == null && endDate == null;
    }

    private boolean wholeDays() {
        return startDate != null && endDate != null && startsAt == null && endsAt == null;
    }

    @AssertTrue(message = "give startsAt and endsAt, or startDate and endDate, not both kinds and not half of one")
    boolean isOneKindOfTime() {
        return timed() || wholeDays();
    }

    @AssertTrue(message = "the end must be after the start")
    boolean isEndAfterStart() {
        if (timed()) {
            return endsAt.isAfter(startsAt);
        }
        return !wholeDays() || endDate.isAfter(startDate);
    }

    @AssertTrue(message = "an appointment lasts at most " + EventTime.MAX_DAYS + " days")
    boolean isShortEnough() {
        if (timed()) {
            return Duration.between(startsAt, endsAt).compareTo(Duration.ofDays(EventTime.MAX_DAYS)) <= 0;
        }
        return !wholeDays() || ChronoUnit.DAYS.between(startDate, endDate) <= EventTime.MAX_DAYS;
    }

    @AssertTrue(message = "the dates of an appointment are within the years 1900 to 2200")
    boolean isWithinSupportedYears() {
        return (startsAt == null || EventTime.isSupported(startsAt)) && (endsAt == null || EventTime.isSupported(endsAt))
                && (startDate == null || EventTime.isSupported(startDate))
                && (endDate == null || EventTime.isSupported(endDate));
    }

    @AssertTrue(message = "a reminder is 0, 5, 15, 30, 60 or 1440 minutes before a start, -540 or 900 before a whole day")
    boolean isReminderAllowed() {
        return ReminderBody.isAllowed(reminder, wholeDays());
    }

    /**
     * Call only once the request is valid.
     *
     * @param create whether this is a new appointment: a reminder left out then takes the default of the settings
     */
    NewEvent toNewEvent(boolean create) {
        EventTime time = timed() ? EventTime.timed(startsAt, endsAt) : EventTime.wholeDays(startDate, endDate);
        Reminder chosen = ReminderBody.reminderOf(reminder);
        return new NewEvent(title, location, notes, time, recurrence == null ? null : recurrence.toRule(), chosen,
                create && ReminderBody.isLeftOut(reminder));
    }

}
