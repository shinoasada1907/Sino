package dev.sino.conversation;

import java.util.Set;
import java.util.UUID;

/**
 * What one {@link ConversationStore#store} changed: messages stored for the first time, and stored messages that
 * changed, in their own fields or in their files; the conversations of the page; how many of the new messages
 * came in from someone else ({@code newInbound}), the "N thư mới" of the web (F08); and how many reactions were put
 * on, changed or taken off messages ({@code reactionsChanged}, zalo-reactions D-385).
 */
public record StoreResult(int newMessages, int updatedMessages, Set<UUID> conversationIds, int newInbound,
        int reactionsChanged) {

    public StoreResult {
        conversationIds = Set.copyOf(conversationIds);
    }

    public StoreResult(int newMessages, int updatedMessages, Set<UUID> conversationIds, int newInbound) {
        this(newMessages, updatedMessages, conversationIds, newInbound, 0);
    }

}
