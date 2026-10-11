package dev.sino.conversation;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * The user marked a conversation read or unread, or archived it or brought it back (F08), or opened a message whose
 * content Sino then read again from the provider (F06), published in the transaction of the change. Lets the tabs of
 * the user read it again.
 */
public record ConversationChanged(UUID accountId, UUID conversationId, Instant changedAt) {

    public ConversationChanged {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(conversationId, "conversationId must not be null");
        Objects.requireNonNull(changedAt, "changedAt must not be null");
    }

}
