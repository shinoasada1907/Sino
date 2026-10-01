package dev.sino.provider.spi;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * A message as a connector reports it. {@code metadata} holds a few small values that have no normalized
 * field; never raw payloads or secrets, and the connector documents its keys.
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
        Map<String, String> metadata) {

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
