package dev.sino.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MessageCursorTests {

    private static final Instant SENT_AT = Instant.parse("2026-10-07T08:00:00.123456Z");
    private static final UUID ID = UUID.fromString("0199c7a0-0000-7000-8000-000000000001");

    @Test
    void readsBackWhatItWrote() {
        MessageCursor cursor = new MessageCursor(SENT_AT, ID);

        String value = cursor.encode();

        assertThat(value).matches("[A-Za-z0-9_-]+");
        assertThat(MessageCursor.valueOf(value)).isEqualTo(cursor);
    }

    @Test
    void aCursorOfOneListIsNoCursorOfTheOther() {
        String inbox = new InboxCursor(SENT_AT, ID).encode();
        String messages = new MessageCursor(SENT_AT, ID).encode();

        assertThat(messages).isNotEqualTo(inbox);
        assertThatIllegalArgumentException().isThrownBy(() -> MessageCursor.valueOf(inbox));
        assertThatIllegalArgumentException().isThrownBy(() -> InboxCursor.valueOf(messages));
    }

    @ParameterizedTest
    @ValueSource(strings = { "message|", "message|yesterday|0199c7a0-0000-7000-8000-000000000001",
        "message|2026-10-07T08:00:00Z|not-a-uuid", "message|2026-10-07T08:00:00Z",
        "message|+10000-01-01T00:00:00Z|0199c7a0-0000-7000-8000-000000000001",
        "messages|2026-10-07T08:00:00Z|0199c7a0-0000-7000-8000-000000000001",
        "notours|2026-10-07T08:00:00Z|0199c7a0-0000-7000-8000-000000000001" })
    void refusesAValueItDidNotWrite(String text) {
        String value = Base64.getUrlEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));

        assertThatIllegalArgumentException().isThrownBy(() -> MessageCursor.valueOf(value));
    }

}
