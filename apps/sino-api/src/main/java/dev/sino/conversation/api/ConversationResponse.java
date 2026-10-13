package dev.sino.conversation.api;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import dev.sino.conversation.application.InboxItem;
import dev.sino.provider.spi.ConversationType;

/**
 * One row of the inbox (F05 design, section 4). An email thread shows the person on the other side as its title and
 * the thread's subject; a chat shows its own title, and a group its size and the sender of the newest message. Never
 * the text of a message beyond its snippet. {@code snooze}, {@code scheduledSend} and {@code linked} stay empty until
 * those features exist.
 */
record ConversationResponse(UUID id, UUID accountId, String provider, String kind, String title, String subject,
        Integer memberCount, String snippetFrom, String snippet, Instant lastMessageAt, int unreadCount,
        boolean needsReply, boolean hasAttachments, boolean archived, Object snooze, Object scheduledSend,
        List<Object> linked) {

    static ConversationResponse from(InboxItem item) {
        boolean email = item.type() == ConversationType.THREAD;
        boolean group = item.type() == ConversationType.GROUP || item.type() == ConversationType.CHANNEL;
        String title = email ? firstOf(item.counterpart(), item.title()) : firstOf(item.title(), item.counterpart());
        return new ConversationResponse(item.id(), item.accountId(), item.provider().value(), email ? "EMAIL" : "CHAT",
                title, email ? item.title() : null, group ? item.participantCount() : null,
                group ? item.lastMessageFrom() : null, item.preview(), item.lastMessageAt(), item.unreadCount(),
                item.needsReply(), item.hasAttachments(), item.archived(), null, null, List.of());
    }

    // The web shows the title as text, so there is always one, empty at worst.
    private static String firstOf(String first, String second) {
        return Objects.requireNonNullElse(first != null ? first : second, "");
    }

}
