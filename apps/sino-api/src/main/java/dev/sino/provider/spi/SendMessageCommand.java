package dev.sino.provider.spi;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

import dev.sino.provider.spi.NormalizedRecipients.Address;

/**
 * A message to send in a conversation (F10): a text, or a picture ({@code image}, D-349) whose text is then empty and
 * becomes {@code null}. {@code conversationType} is the kind of conversation it goes to
 * (D-280: personal vs. group chat on Zalo); {@code replyToExternalMessageId} is the message it answers, when
 * there is one; {@code to} whom it goes to, empty for a provider that sends to the conversation itself;
 * {@code senderName} the name the account writes in its own mail, {@code null} when Sino does not know it (BE-62).
 * {@code clientMessageId} is the ID Sino gave it (D-131). When the outcome of the send is unknown,
 * {@link MessageProvider#findSentMessages} gets the same command to find the message again (D-132). Only a connector
 * with {@code SEND_IMAGES} may be given a command with a picture.
 */
public record SendMessageCommand(String externalConversationId, ConversationType conversationType,
        String textContent, String replyToExternalMessageId, List<Address> to, UUID clientMessageId,
        String senderName, OutgoingImage image) {

    public SendMessageCommand {
        if (externalConversationId == null || externalConversationId.isBlank()) {
            throw new IllegalArgumentException("externalConversationId must not be blank");
        }
        boolean hasText = textContent != null && !textContent.isBlank();
        if (!hasText && image == null) {
            throw new IllegalArgumentException("textContent must not be blank");
        }
        Objects.requireNonNull(clientMessageId, "clientMessageId must not be null");
        textContent = hasText ? textContent : null;
        conversationType = conversationType == null ? ConversationType.DIRECT : conversationType;
        to = to == null ? List.of() : List.copyOf(to);
        senderName = senderName == null || senderName.isBlank() ? null : senderName.strip();
    }

    /** A text message. */
    public SendMessageCommand(String externalConversationId, ConversationType conversationType,
            String textContent, String replyToExternalMessageId, List<Address> to, UUID clientMessageId,
            String senderName) {
        this(externalConversationId, conversationType, textContent, replyToExternalMessageId, to, clientMessageId,
                senderName, null);
    }

    public SendMessageCommand(String externalConversationId, String textContent,
            String replyToExternalMessageId, List<Address> to, UUID clientMessageId, String senderName) {
        this(externalConversationId, ConversationType.DIRECT, textContent, replyToExternalMessageId, to,
                clientMessageId, senderName);
    }

}
