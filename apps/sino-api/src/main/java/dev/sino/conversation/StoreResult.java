package dev.sino.conversation;

/**
 * What one {@link ConversationStore#store} changed: messages stored for the first time, and stored messages that
 * changed, in their own fields or in their files.
 */
public record StoreResult(int newMessages, int updatedMessages) {
}
