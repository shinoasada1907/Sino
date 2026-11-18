package dev.sino.provider.spi;

import java.time.Instant;
import java.util.Map;

/**
 * The message a reply quotes (zalo-quote-reply, D-507): its provider ID, who sent it, its text, when it was sent, and
 * the {@code metadata} Sino stored with it, so the connector finds again what it needs to quote it (for Zalo the
 * {@code cliMsgId}, {@code ttl}, {@code msgType}, {@code propertyExt} and, for a message that is not text,
 * {@code rawContent}). Only a connector whose {@link MessageProvider#canQuote} said yes is given one. The text of the
 * record never shows the text of the message.
 */
public record QuotedMessage(String externalMessageId, String senderExternalId, String text, Instant sentAt,
        Map<String, String> metadata) {

    public QuotedMessage {
        if (externalMessageId == null || externalMessageId.isBlank()) {
            throw new IllegalArgumentException("externalMessageId must not be blank");
        }
        if (senderExternalId == null || senderExternalId.isBlank()) {
            throw new IllegalArgumentException("senderExternalId must not be blank");
        }
        if (sentAt == null) {
            throw new IllegalArgumentException("sentAt must not be null");
        }
        text = text == null ? "" : text;
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }

    @Override
    public String toString() {
        return "QuotedMessage[message=" + externalMessageId + ", sentAt=" + sentAt + "]";
    }

}
