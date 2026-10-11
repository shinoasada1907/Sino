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

import dev.sino.conversation.application.MessageCursor;
import dev.sino.conversation.application.MessageHistory;
import dev.sino.conversation.application.MessagePage;
import dev.sino.identity.CurrentUser;

/**
 * The messages of one conversation (F06): pages of them, newest first. The conversation must be in the current
 * user's inbox, archived or not; any other is a 404 like {@code GET /api/conversations/{id}}.
 */
@RestController
@RequestMapping("/api/conversations/{id}/messages")
class ConversationMessagesController {

    private final MessageHistory history;
    private final CurrentUser currentUser;

    ConversationMessagesController(MessageHistory history, CurrentUser currentUser) {
        this.history = history;
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

    record MessagePageResponse(List<MessageResponse> items, String nextCursor) {
    }

}
