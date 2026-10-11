package dev.sino.conversation.application;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Where the next page of the inbox starts: after this conversation in the order newest first, then ID (keyset
 * paging). Opaque to the web app: base64url of {@code <lastMessageAt>|<id>}.
 */
public record InboxCursor(Instant lastMessageAt, UUID id) {

    private static final String KIND = "";

    public InboxCursor {
        Objects.requireNonNull(lastMessageAt, "lastMessageAt must not be null");
        Objects.requireNonNull(id, "id must not be null");
    }

    /**
     * Reads a cursor this API handed out; Spring MVC uses it for a {@code cursor} parameter.
     *
     * @throws IllegalArgumentException when the value is not such a cursor
     */
    public static InboxCursor valueOf(String value) {
        KeysetCursor.Position position = KeysetCursor.decode(KIND, value);
        return new InboxCursor(position.at(), position.id());
    }

    public String encode() {
        return KeysetCursor.encode(KIND, lastMessageAt, id);
    }

}
