package dev.sino.planner.api;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.identity.CurrentUser;
import dev.sino.planner.application.CalendarService;

/**
 * The calendar of the signed-in user for a range of days (F17, spec {@code calendar}): the occurrences of the
 * appointments and the tasks due in it, in one request (D-86).
 */
@RestController
@RequestMapping("/api/calendar")
class CalendarController {

    private final CalendarService calendar;
    private final CurrentUser currentUser;

    CalendarController(CalendarService calendar, CurrentUser currentUser) {
        this.calendar = calendar;
        this.currentUser = currentUser;
    }

    @GetMapping
    CalendarResponse get(@Valid CalendarQuery query) {
        return CalendarResponse.from(calendar.view(currentUser.requireOwnerId(), query.from(), query.to()));
    }

}
