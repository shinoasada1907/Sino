package dev.sino.provider.spi;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.spi.NormalizedRecipients.Address;

/**
 * A text message to send in a conversation (F10). {@code replyToExternalMessageId} is the message it answers, when
 * there is one; {@code to} whom it goes to, empty for a provider that sends to the conversation itself. The
 * connector marks the message with {@code clientMessageId}, the ID Sino gave it, so that
 * {@link MessageProvider#findSentMessage} can find it again when the outcome of the send is unknown (D-131, D-132).
 */
public record SendMessageCommand(String externalConversationId, String textContent,
        String replyToExternalMessageId, List<Address> to, UUID clientMessageId) {

    public SendMessageCommand {
        if (externalConversationId == null || externalConversationId.isBlank()) {
            throw new IllegalArgumentException("externalConversationId must not be blank");
        }
        if (textContent == null || textContent.isBlank()) {
            throw new IllegalArgumentException("textContent must not be blank");
        }
        Objects.requireNonNull(clientMessageId, "clientMessageId must not be null");
        to = to == null ? List.of() : List.copyOf(to);
    }

}
