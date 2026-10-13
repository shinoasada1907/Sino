package dev.sino.conversation.application;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Where the next page of a conversation's messages starts: after this message in the order newest first, then ID.
 * Opaque to the web app, and never the text of a cursor of the inbox.
 */
public record MessageCursor(Instant sentAt, UUID id) {

    private static final String KIND = "message|";

    public MessageCursor {
        Objects.requireNonNull(sentAt, "sentAt must not be null");
        Objects.requireNonNull(id, "id must not be null");
    }

    /**
     * Reads a cursor this API handed out; Spring MVC uses it for a {@code cursor} parameter.
     *
     * @throws IllegalArgumentException when the value is not such a cursor
     */
    public static MessageCursor valueOf(String value) {
        KeysetCursor.Position position = KeysetCursor.decode(KIND, value);
        return new MessageCursor(position.at(), position.id());
    }

    public String encode() {
        return KeysetCursor.encode(KIND, sentAt, id);
    }

}
