package dev.sino.conversation.api;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.conversation.application.MessageBodies;
import dev.sino.conversation.application.MessageBody;
import dev.sino.conversation.application.MessageCursor;
import dev.sino.conversation.application.MessageHistory;
import dev.sino.conversation.application.MessagePage;
import dev.sino.identity.CurrentUser;

/**
 * The messages of one conversation (F06): pages of them, newest first, and the full content of one. The conversation
 * must be in the current user's inbox, archived or not; any other is a 404 like {@code GET /api/conversations/{id}}.
 */
@RestController
@RequestMapping("/api/conversations/{id}/messages")
class ConversationMessagesController {

    private final MessageHistory history;
    private final MessageBodies bodies;
    private final CurrentUser currentUser;

    ConversationMessagesController(MessageHistory history, MessageBodies bodies, CurrentUser currentUser) {
        this.history = history;
        this.bodies = bodies;
        this.currentUser = currentUser;
    }

    /** A {@code cursor} that this API did not hand out, like a {@code limit} out of range, is a 400. */
    @GetMapping
    MessagePageResponse list(@PathVariable UUID id, @RequestParam(required = false) MessageCursor cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        MessagePage page = history.page(currentUser.requireOwnerId(), id, cursor, limit);
        return new MessagePageResponse(page.items().stream().map(MessageResponse::from).toList(),
                page.next() == null ? null : page.next().encode());
    }

    /**
     * Cleaned HTML, never the HTML as sent (D-120). The first request for a message stored before Sino kept HTML reads
     * it again from the provider; when that fails it is a 502 and the web shows the text.
     */
    @GetMapping("/{messageId}/body")
    MessageBodyResponse body(@PathVariable UUID id, @PathVariable UUID messageId) {
        MessageBody body = bodies.body(currentUser.requireOwnerId(), id, messageId);
        return new MessageBodyResponse(body.format().name(), body.html(), body.remoteImages());
    }

    record MessagePageResponse(List<MessageResponse> items, String nextCursor) {
    }

    record MessageBodyResponse(String format, String html, boolean remoteImages) {
    }

}
