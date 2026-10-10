package dev.sino.conversation;

import java.util.Set;
import java.util.UUID;

/**
 * What one {@link ConversationStore#store} changed: messages stored for the first time, and stored messages that
 * changed, in their own fields or in their files; the conversations of the page; and how many of the new messages
 * came in from someone else ({@code newInbound}), the "N thư mới" of the web (F08).
 */
public record StoreResult(int newMessages, int updatedMessages, Set<UUID> conversationIds, int newInbound) {

    public StoreResult {
        conversationIds = Set.copyOf(conversationIds);
    }

}
