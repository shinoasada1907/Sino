package dev.sino.conversation.application;

import java.util.Map;

/**
 * Conversations that are not archived: with unread mail, the same by provider, needing a reply, with files. Every
 * provider of an account in the inbox is in {@code unreadByProvider}, with 0 when nothing is unread.
 */
public record InboxCounts(long unread, Map<String, Long> unreadByProvider, long needsReply, long withAttachments) {
}
