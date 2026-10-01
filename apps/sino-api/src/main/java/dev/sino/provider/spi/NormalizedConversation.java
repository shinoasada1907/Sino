package dev.sino.provider.spi;

import java.time.Instant;
import java.util.List;

/**
 * A conversation as a connector reports it.
 */
public record NormalizedConversation(String externalConversationId, ConversationType type, String title,
        String avatarUrl, List<NormalizedParticipant> participants, Instant lastActivityAt) {

    public NormalizedConversation {
        PayloadChecks.requireText(externalConversationId, "externalConversationId");
        type = type == null ? ConversationType.UNKNOWN : type;
        participants = PayloadChecks.copyOf(participants, "participants");
    }

}
