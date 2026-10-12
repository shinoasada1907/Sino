package dev.sino.conversation;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * The user marked a conversation read or unread, or archived it or brought it back (F08), opened a message whose
 * content Sino then read again from the provider (F06), or sent or discarded a reply, whose outcome may be settled
 * later (F10); published in the transaction of the change. Lets the tabs of the user read it again.
 */
public record ConversationChanged(UUID accountId, UUID conversationId, Instant changedAt) {

    public ConversationChanged {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(conversationId, "conversationId must not be null");
        Objects.requireNonNull(changedAt, "changedAt must not be null");
    }

}
