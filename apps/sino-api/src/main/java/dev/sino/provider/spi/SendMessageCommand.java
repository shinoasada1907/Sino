package dev.sino.provider.spi;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.spi.NormalizedRecipients.Address;

/**
 * A text message to send in a conversation (F10). {@code replyToExternalMessageId} is the message it answers, when
 * there is one; {@code to} whom it goes to, empty for a provider that sends to the conversation itself;
 * {@code senderName} the name the account writes in its own mail, {@code null} when Sino does not know it (BE-62).
 * {@code clientMessageId} is the ID Sino gave it (D-131). When the outcome of the send is unknown,
 * {@link MessageProvider#findSentMessages} gets the same command to find the message again (D-132).
 */
public record SendMessageCommand(String externalConversationId, String textContent,
        String replyToExternalMessageId, List<Address> to, UUID clientMessageId, String senderName) {

    public SendMessageCommand {
        if (externalConversationId == null || externalConversationId.isBlank()) {
            throw new IllegalArgumentException("externalConversationId must not be blank");
        }
        if (textContent == null || textContent.isBlank()) {
            throw new IllegalArgumentException("textContent must not be blank");
        }
        Objects.requireNonNull(clientMessageId, "clientMessageId must not be null");
        to = to == null ? List.of() : List.copyOf(to);
        senderName = senderName == null || senderName.isBlank() ? null : senderName.strip();
    }

}
