package dev.sino.conversation.application;

import java.time.Instant;
import java.util.UUID;

import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;

/** One conversation of the inbox as stored: its row and the number of its participants. */
public record InboxItem(UUID id, UUID accountId, ProviderType provider, ConversationType type, String title,
        String counterpart, String lastMessageFrom, String preview, Instant lastMessageAt, int unreadCount,
        boolean needsReply, boolean hasAttachments, boolean archived, int participantCount) {
}
