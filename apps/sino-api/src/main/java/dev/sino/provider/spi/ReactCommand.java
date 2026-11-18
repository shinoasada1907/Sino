package dev.sino.provider.spi;

import java.util.Map;

/**
 * A reaction to put on a message, or to take off it when {@code code} is empty (zalo-reactions, D-383). The message is
 * named by its conversation and external ID, and {@code messageMetadata} is the metadata Sino stored with it, so the
 * connector finds again what it needs (such as Zalo's {@code cliMsgId}). A connector refuses a {@code code} that is
 * not in its {@link MessageProvider#reactionSet()} before calling its provider.
 */
public record ReactCommand(String externalConversationId, ConversationType conversationType,
        String externalMessageId, Map<String, String> messageMetadata, String code) {

    public ReactCommand {
        if (externalConversationId == null || externalConversationId.isBlank()) {
            throw new IllegalArgumentException("externalConversationId must not be blank");
        }
        if (externalMessageId == null || externalMessageId.isBlank()) {
            throw new IllegalArgumentException("externalMessageId must not be blank");
        }
        conversationType = conversationType == null ? ConversationType.DIRECT : conversationType;
        messageMetadata = messageMetadata == null ? Map.of() : Map.copyOf(messageMetadata);
        code = code == null ? "" : code;
        if (code.length() > NormalizedReaction.MAX_CODE || code.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("code must be at most " + NormalizedReaction.MAX_CODE
                    + " characters without a control character");
        }
    }

    /** True when this takes the account's reaction off the message. */
    public boolean removal() {
        return code.isEmpty();
    }

    @Override
    public String toString() {
        return "ReactCommand[conversation=" + externalConversationId + ", message=" + externalMessageId
                + ", removal=" + removal() + "]";
    }

}
