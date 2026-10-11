package dev.sino.provider.spi;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * A message as a connector reports it. {@code metadata} holds a few small values that have no normalized
 * field; never raw payloads or secrets, and the connector documents its keys. {@link #BULK} and {@link #SUBJECT} are
 * the keys every connector shares. {@code recipients} is null when the connector cannot tell them, as for a chat.
 * {@code htmlContent} is the HTML body as the provider gives it, never cleaned, or null when the message has none; the
 * text stays the text Sino shows in lists and previews.
 */
public record NormalizedMessage(
        String externalMessageId,
        String externalConversationId,
        String senderExternalParticipantId,
        MessageDirection direction,
        MessageType type,
        String textContent,
        MessageStatus status,
        boolean read,
        String replyToExternalMessageId,
        Instant sentAt,
        List<NormalizedAttachment> attachments,
        Map<String, String> metadata,
        NormalizedRecipients recipients,
        String htmlContent) {

    /**
     * Metadata key, {@code "true"} when the message was sent in bulk: a newsletter, an advertisement, an automatic
     * notice (D-68). A connector that cannot tell leaves it out, and a missing key means not bulk.
     */
    public static final String BULK = "bulk";

    /** Metadata key, the subject of an email as its sender wrote it; left out when there is none. */
    public static final String SUBJECT = "subject";

    public NormalizedMessage {
        PayloadChecks.requireText(externalMessageId, "externalMessageId");
        PayloadChecks.requireText(externalConversationId, "externalConversationId");
        PayloadChecks.requireValue(direction, "direction");
        PayloadChecks.requireValue(sentAt, "sentAt");
        type = type == null ? MessageType.UNKNOWN : type;
        status = status == null ? MessageStatus.UNKNOWN : status;
        attachments = PayloadChecks.copyOf(attachments, "attachments");
        metadata = PayloadChecks.copyOf(metadata, "metadata");
    }

}
