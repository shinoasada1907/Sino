package dev.sino.conversation.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;

/**
 * One row of the inbox: a thread, stored as one conversation, or as copies in several accounts of the owner (F05b,
 * D-180). {@code id} names the group, its oldest copy in the inbox (D-183). The primary copy holds the newest message
 * (D-181): {@code primaryId}, {@code accountId}, the title, sender, preview and type are its; the time, counts and
 * flags come from every copy (D-182). {@code accountIds} has the account of the primary copy first, then the others
 * from the oldest copy on. {@code avatarUrl} is the picture the provider gave the conversation, kept by its primary
 * copy: null for mail, and for a chat the provider gave none.
 */
public record InboxItem(UUID id, UUID primaryId, UUID accountId, List<UUID> accountIds, List<Copy> copies,
        ProviderType provider, ConversationType type, String title, String avatarUrl, String counterpart,
        String lastMessageFrom, String preview, Instant lastMessageAt, int unreadCount, boolean needsReply,
        boolean hasAttachments, boolean archived, int participantCount) {

    public InboxItem {
        accountIds = List.copyOf(accountIds);
        copies = List.copyOf(copies);
    }

    /** One copy of the thread: a conversation of one account of the inbox. */
    public record Copy(UUID id, UUID accountId) {
    }

    /** The conversations of the copies, oldest first. */
    public List<UUID> conversationIds() {
        return copies.stream().map(Copy::id).toList();
    }

    /** @throws IllegalArgumentException when the conversation is not one of the copies */
    public UUID accountOf(UUID conversationId) {
        return copies.stream().filter(copy -> copy.id().equals(conversationId)).map(Copy::accountId).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Not a copy of this thread: " + conversationId));
    }

}
