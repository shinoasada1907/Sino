package dev.sino.conversation.application;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.UUID;

/**
 * The text of a keyset cursor: base64url of {@code <kind><instant>|<id>}. The kind keeps the cursor of one list from
 * being taken by another.
 */
final class KeysetCursor {

    // What PostgreSQL stores comfortably; a cursor beyond it is no cursor this API handed out.
    private static final Instant FIRST = Instant.parse("0001-01-01T00:00:00Z");
    private static final Instant LAST = Instant.parse("9999-12-31T23:59:59.999999Z");

    private KeysetCursor() {
    }

    static String encode(String kind, Instant at, UUID id) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString((kind + at + "|" + id).getBytes(StandardCharsets.UTF_8));
    }

    /** @throws IllegalArgumentException when the value is not a cursor of this kind */
    static Position decode(String kind, String value) {
        String text = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
        int separator = text.indexOf('|', kind.length());
        if (!text.startsWith(kind) || separator < 0) {
            throw new IllegalArgumentException("Not a cursor of this list");
        }
        try {
            Instant at = Instant.parse(text.substring(kind.length(), separator));
            if (at.isBefore(FIRST) || at.isAfter(LAST)) {
                throw new IllegalArgumentException("Not a cursor of this list");
            }
            return new Position(at, UUID.fromString(text.substring(separator + 1)));
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Not a cursor of this list", e);
        }
    }

    record Position(Instant at, UUID id) {
    }

}
