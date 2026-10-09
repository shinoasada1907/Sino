package dev.sino.conversation.application;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.Objects;
import java.util.UUID;

/**
 * Where the next page of the inbox starts: after this conversation in the order newest first, then ID (keyset
 * paging). Opaque to the web app: base64url of {@code <lastMessageAt>|<id>}.
 */
public record InboxCursor(Instant lastMessageAt, UUID id) {

    // What PostgreSQL stores comfortably; a cursor beyond it is no cursor this API handed out.
    private static final Instant FIRST = Instant.parse("0001-01-01T00:00:00Z");
    private static final Instant LAST = Instant.parse("9999-12-31T23:59:59.999999Z");

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
        String text = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
        int separator = text.indexOf('|');
        if (separator < 0) {
            throw new IllegalArgumentException("Not an inbox cursor");
        }
        try {
            Instant lastMessageAt = Instant.parse(text.substring(0, separator));
            if (lastMessageAt.isBefore(FIRST) || lastMessageAt.isAfter(LAST)) {
                throw new IllegalArgumentException("Not an inbox cursor");
            }
            return new InboxCursor(lastMessageAt, UUID.fromString(text.substring(separator + 1)));
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Not an inbox cursor", e);
        }
    }

    public String encode() {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString((lastMessageAt + "|" + id).getBytes(StandardCharsets.UTF_8));
    }

}
