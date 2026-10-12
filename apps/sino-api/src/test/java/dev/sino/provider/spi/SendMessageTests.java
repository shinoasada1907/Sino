package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.provider.spi.NormalizedRecipients.Address;

class SendMessageTests {

    private static final UUID CLIENT_MESSAGE_ID = UUID.fromString("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b");
    private static final List<Address> TO = List.of(new Address("An", "an@example.test"));

    @Test
    void aCommandCarriesItsAddresseesTheIdSinoGaveItAndTheSendersName() {
        List<Address> to = new ArrayList<>(TO);

        SendMessageCommand command = new SendMessageCommand("c-1", "hello", "m-9", to, CLIENT_MESSAGE_ID,
                " Nguyễn Tiến ");
        to.add(new Address(null, "other@example.test"));

        assertThat(command.replyToExternalMessageId()).isEqualTo("m-9");
        assertThat(command.to()).containsExactly(new Address("An", "an@example.test"));
        assertThat(command.clientMessageId()).isEqualTo(CLIENT_MESSAGE_ID);
        assertThat(command.senderName()).isEqualTo("Nguyễn Tiến");
        assertThatExceptionOfType(UnsupportedOperationException.class)
                .isThrownBy(() -> command.to().add(new Address(null, "x@example.test")));
    }

    // A chat provider sends to the conversation itself: no addressee and no message to reply to. Sino may not know
    // the name the account writes in its own mail (BE-62).
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void aReplyTargetAddresseesAndTheSendersNameAreOptional(String name) {
        SendMessageCommand command = new SendMessageCommand("c-1", "hello", null, null, CLIENT_MESSAGE_ID, name);

        assertThat(command.replyToExternalMessageId()).isNull();
        assertThat(command.to()).isEmpty();
        assertThat(command.senderName()).isNull();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void aCommandNeedsAConversationAndText(String blank) {
        assertThatThrownBy(() -> new SendMessageCommand(blank, "hello", null, TO, CLIENT_MESSAGE_ID, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SendMessageCommand("c-1", blank, null, TO, CLIENT_MESSAGE_ID, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // Without it a provider cannot be asked later whether the message went out (D-131, D-132).
    @Test
    void aCommandNeedsTheIdSinoGaveIt() {
        assertThatThrownBy(() -> new SendMessageCommand("c-1", "hello", null, TO, null, null))
                .isInstanceOf(NullPointerException.class).hasMessageContaining("clientMessageId");
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
