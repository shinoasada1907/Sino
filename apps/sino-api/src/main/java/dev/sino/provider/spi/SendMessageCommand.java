package dev.sino.provider.spi;

/**
 * A text message to send. {@code replyToExternalMessageId} is optional.
 */
public record SendMessageCommand(String externalConversationId, String textContent,
        String replyToExternalMessageId) {

    public SendMessageCommand {
        if (externalConversationId == null || externalConversationId.isBlank()) {
            throw new IllegalArgumentException("externalConversationId must not be blank");
        }
        if (textContent == null || textContent.isBlank()) {
            throw new IllegalArgumentException("textContent must not be blank");
        }
    }

}
