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

class InboxCursorTests {

    @Test
    void readsBackWhatItWrote() {
        InboxCursor cursor = new InboxCursor(Instant.parse("2026-10-07T08:00:00.123456Z"),
                UUID.fromString("0199c7a0-0000-7000-8000-000000000001"));

        String value = cursor.encode();

        assertThat(value).matches("[A-Za-z0-9_-]+");
        assertThat(InboxCursor.valueOf(value)).isEqualTo(cursor);
    }

    @ParameterizedTest
    @ValueSource(strings = { "no separator", "2026-10-07T08:00:00Z|not-a-uuid",
        "yesterday|0199c7a0-0000-7000-8000-000000000001", "+10000-01-01T00:00:00Z|0199c7a0-0000-7000-8000-000000000001",
        "-0001-12-31T23:59:59Z|0199c7a0-0000-7000-8000-000000000001" })
    void refusesAValueItDidNotWrite(String text) {
        String value = Base64.getUrlEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));

        assertThatIllegalArgumentException().isThrownBy(() -> InboxCursor.valueOf(value));
    }

    @Test
    void refusesAValueThatIsNotBase64url() {
        assertThatIllegalArgumentException().isThrownBy(() -> InboxCursor.valueOf("not/base64+url"));
    }

}
