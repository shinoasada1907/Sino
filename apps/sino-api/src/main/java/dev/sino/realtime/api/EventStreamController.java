package dev.sino.realtime.api;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import dev.sino.identity.CurrentUser;
import dev.sino.realtime.application.EventHub;

/**
 * The event stream of the signed-in user (F08, D-77): {@code conversations.changed} and {@code account.changed}, so
 * the web knows what to read again. Without a session it is a 401 like the rest of the API, never a redirect.
 */
@RestController
class EventStreamController {

    private final EventHub hub;
    private final CurrentUser currentUser;

    EventStreamController(EventHub hub, CurrentUser currentUser) {
        this.hub = hub;
        this.currentUser = currentUser;
    }

    // X-Accel-Buffering: a proxy such as nginx would otherwise hold the events back until its buffer fills.
    @GetMapping(path = "/api/events/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    ResponseEntity<SseEmitter> stream() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Accel-Buffering", "no")
                .body(hub.open(currentUser.requireOwnerId()));
    }

}
