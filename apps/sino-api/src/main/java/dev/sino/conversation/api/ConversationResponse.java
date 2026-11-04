package dev.sino.conversation.api;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import dev.sino.conversation.application.InboxItem;
import dev.sino.provider.ProviderKind;
import dev.sino.provider.spi.ConversationType;

/**
 * One row of the inbox (F05 design, section 4). An email thread shows the person on the other side as its title and
 * the thread's subject; a chat shows its own title, and a group its size and the sender of the newest message. Never
 * the text of a message beyond its snippet. A thread found in several accounts of the owner is one row (F05b):
 * {@code id} names the group, {@code accountId} is the account of its primary copy and {@code accountIds} every
 * account of it, that one first. {@code avatarUrl} is the picture of a chat (the group's, or the other person's in a
 * 1-1 chat) as the provider gave it, null when it gave none and always null for mail (zalo-avatars, D-411).
 * {@code snooze}, {@code scheduledSend} and {@code linked} stay empty until those features exist. {@code nickname}
 * is the one Sino stored for a 1-1 chat (zalo-nicknames, D-416), or null; {@code title} stays the provider's name,
 * never the nickname.
 */
record ConversationResponse(UUID id, UUID accountId, List<UUID> accountIds, String provider, String kind,
        String title, String avatarUrl, String nickname, String subject, Integer memberCount, String snippetFrom,
        String snippet, Instant lastMessageAt, int unreadCount, boolean needsReply, boolean hasAttachments,
        boolean archived, Object snooze, Object scheduledSend, List<Object> linked) {

    static ConversationResponse from(InboxItem item) {
        boolean email = item.kind() == ProviderKind.EMAIL;
        boolean group = item.type() == ConversationType.GROUP || item.type() == ConversationType.CHANNEL;
        String title = email ? firstOf(item.counterpart(), item.title()) : firstOf(item.title(), item.counterpart());
        return new ConversationResponse(item.id(), item.accountId(), item.accountIds(), item.provider().value(),
                item.kind().name(), title, email ? null : item.avatarUrl(), item.nickname(),
                email ? item.title() : null, group ? item.participantCount() : null,
                group ? item.lastMessageFrom() : null, item.preview(), item.lastMessageAt(), item.unreadCount(),
                item.needsReply(), item.hasAttachments(), item.archived(), null, null, List.of());
    }

    // The web shows the title as text, so there is always one, empty at worst.
    private static String firstOf(String first, String second) {
        return Objects.requireNonNullElse(first != null ? first : second, "");
    }

}
