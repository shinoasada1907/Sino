package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class SendMessageTests {

    @Test
    void aReplyTargetIsOptional() {
        SendMessageCommand command = new SendMessageCommand("c-1", "hello", null);

        assertThat(command.replyToExternalMessageId()).isNull();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void aCommandNeedsAConversationAndText(String blank) {
        assertThatThrownBy(() -> new SendMessageCommand(blank, "hello", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SendMessageCommand("c-1", blank, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void aResultNeedsTheProviderMessageId(String externalMessageId) {
        assertRejectedAsInvalidPayload(() -> new SendMessageResult(externalMessageId, MessageStatus.SENT, null));
    }

    @Test
    void anUnmappedStatusBecomesUnknown() {
        assertThat(new SendMessageResult("m-9", null, null).status()).isEqualTo(MessageStatus.UNKNOWN);
    }

}
