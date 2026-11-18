package dev.sino.planner.api;

import java.net.URI;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import dev.sino.identity.CurrentUser;
import dev.sino.planner.application.EventService;
import dev.sino.planner.application.ReminderViews;
import dev.sino.planner.domain.CalendarEvent;

/**
 * The appointments of the signed-in user (F17, spec {@code calendar}). Reading, replacing and deleting a repeating
 * appointment act on the whole series (D-151); the occurrences in a range of days come from {@code /api/calendar}.
 */
@RestController
@RequestMapping("/api/events")
class EventsController {

    private final EventService events;
    private final ReminderViews reminders;
    private final CurrentUser currentUser;

    EventsController(EventService events, ReminderViews reminders, CurrentUser currentUser) {
        this.reminders = reminders;
        this.events = events;
        this.currentUser = currentUser;
    }

    @PostMapping
    ResponseEntity<EventResponse> create(@Valid @RequestBody EventRequest request) {
        CalendarEvent event = events.create(currentUser.requireOwnerId(), request.toNewEvent(true));
        URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(event.id())
                .toUri();
        return ResponseEntity.created(location).body(response(event));
    }

    /** The appointment as a whole: its first occurrence and its rule. */
    @GetMapping("/{id}")
    EventResponse get(@PathVariable UUID id) {
        return response(events.get(currentUser.requireOwnerId(), id));
    }

    /** Replaces the whole appointment (D-153), every occurrence of a repeating one with it (D-151). */
    @PutMapping("/{id}")
    EventResponse replace(@PathVariable UUID id, @Valid @RequestBody EventRequest request) {
        return response(events.replace(currentUser.requireOwnerId(), id, request.toNewEvent(false)));
    }

    private EventResponse response(CalendarEvent event) {
        return EventResponse.from(event, reminders.of(event));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        events.delete(currentUser.requireOwnerId(), id);
    }

}
