package dev.sino.conversation.application;

import java.util.Map;
import java.util.UUID;

import dev.sino.provider.ProviderKind;

/**
 * Conversations that are not archived: with unread mail, the same by provider, needing a reply, with files. Every
 * provider of an account in the inbox is in {@code unreadByProvider}, with 0 when nothing is unread. All of these are
 * of the kind asked for, if any; {@code unreadByKind} is always of every kind, each with at least 0 (f05c, D-307).
 * {@code byAccount} gives the numbers of each account (D-425).
 */
public record InboxCounts(long unread, Map<String, Long> unreadByProvider, long needsReply, long withAttachments,
        Map<ProviderKind, Long> unreadByKind, Map<UUID, AccountCount> byAccount) {

    public record AccountCount(long unread, long needsReply, long withAttachments) {
    }
}
