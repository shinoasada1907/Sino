package dev.sino.conversation.infrastructure;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.NormalizedRecipients;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.SyncBatch;

/**
 * The batch without the NUL character, which PostgreSQL stores neither in text nor in jsonb: one such character from
 * a connector would fail the whole page, again on every retry.
 */
final class WithoutNul {

    private WithoutNul() {
    }

    static SyncBatch of(SyncBatch batch) {
        return new SyncBatch(batch.conversations().stream().map(WithoutNul::conversation).toList(),
                batch.messages().stream().map(WithoutNul::message).toList(), batch.skipped(), batch.nextCursor(),
                batch.hasMore());
    }

    private static NormalizedConversation conversation(NormalizedConversation c) {
        return new NormalizedConversation(text(c.externalConversationId()), c.type(), text(c.title()),
                text(c.avatarUrl()), c.participants().stream().map(WithoutNul::participant).toList(),
                c.lastActivityAt());
    }

    private static NormalizedParticipant participant(NormalizedParticipant p) {
        return new NormalizedParticipant(text(p.externalParticipantId()), text(p.displayName()), text(p.avatarUrl()),
                p.self());
    }

    private static NormalizedMessage message(NormalizedMessage m) {
        Map<String, String> metadata = new LinkedHashMap<>();
        m.metadata().forEach((key, value) -> metadata.putIfAbsent(text(key), text(value)));
        return new NormalizedMessage(text(m.externalMessageId()), text(m.externalConversationId()),
                text(m.senderExternalParticipantId()), m.direction(), m.type(), text(m.textContent()), m.status(),
                m.read(), text(m.replyToExternalMessageId()), m.sentAt(),
                m.attachments().stream().map(WithoutNul::attachment).toList(), metadata, recipients(m.recipients()),
                text(m.htmlContent()));
    }

    static MessageContent of(MessageContent content) {
        return new MessageContent(text(content.htmlContent()), recipients(content.recipients()),
                content.attachments().stream().map(WithoutNul::attachment).toList());
    }

    private static NormalizedRecipients recipients(NormalizedRecipients r) {
        return r == null ? null
                : new NormalizedRecipients(addresses(r.to()), addresses(r.cc()), addresses(r.replyTo()));
    }

    // An address that was nothing but NUL is none at all, and so is such a name.
    private static List<Address> addresses(List<Address> addresses) {
        return addresses.stream().filter(a -> !text(a.address()).isBlank())
                .map(a -> new Address(a.name() == null || text(a.name()).isBlank() ? null : text(a.name()),
                        text(a.address())))
                .toList();
    }

    private static NormalizedAttachment attachment(NormalizedAttachment a) {
        return new NormalizedAttachment(text(a.externalAttachmentId()), text(a.fileName()), text(a.mimeType()),
                a.sizeBytes(), text(a.remoteUrl()), text(a.thumbnailUrl()), text(a.contentId()));
    }

    private static String text(String value) {
        return value == null ? null : value.replace("\u0000", "");
    }

}
