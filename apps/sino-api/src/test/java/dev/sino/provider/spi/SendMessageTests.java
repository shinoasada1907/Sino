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
    private static final OutgoingImage PICTURE = new OutgoingImage(new byte[] {1, 2, 3}, "image/png", "sticker.png", 64, 64);
    private static final OutgoingFile FILE = new OutgoingFile(new byte[] {'%', 'P', 'D', 'F'}, "application/pdf",
            "bao-cao.pdf", OutgoingFile.Kind.FILE);

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

    // A picture is a message by itself (D-349): its text is empty, which is a fault only for a command without one.
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void aPictureNeedsNoText(String blank) {
        SendMessageCommand command = new SendMessageCommand("c-1", ConversationType.DIRECT, blank, null, null,
                CLIENT_MESSAGE_ID, null, PICTURE);

        assertThat(command.image()).isEqualTo(PICTURE);
        assertThat(command.textContent()).isNull();
    }

    @Test
    void aPictureMayComeWithATextAndTheCommandKeepsBoth() {
        SendMessageCommand command = new SendMessageCommand("c-1", ConversationType.GROUP, "look", null, null,
                CLIENT_MESSAGE_ID, null, PICTURE);

        assertThat(command.textContent()).isEqualTo("look");
        assertThat(command.image()).isEqualTo(PICTURE);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void aCommandWithNeitherATextNorAPictureIsRefused(String blank) {
        assertThatThrownBy(() -> new SendMessageCommand("c-1", ConversationType.DIRECT, blank, null, null,
                CLIENT_MESSAGE_ID, null, null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aCommandBuiltTheOldWaysHasNoPicture() {
        assertThat(new SendMessageCommand("c-1", "hello", null, TO, CLIENT_MESSAGE_ID, null).image()).isNull();
        assertThat(new SendMessageCommand("c-1", ConversationType.GROUP, "hello", null, TO, CLIENT_MESSAGE_ID, null)
                .image()).isNull();
        assertThat(new SendMessageCommand("c-1", ConversationType.GROUP, null, null, TO, CLIENT_MESSAGE_ID, null,
                PICTURE).file()).isNull();
    }

    // zalo-send-files, D-372: a file from the computer is a message by itself, without a text or a sticker's picture.
    @Test
    void aFileGoesAlone() {
        SendMessageCommand command = new SendMessageCommand("c-1", ConversationType.DIRECT, " ", null, null,
                CLIENT_MESSAGE_ID, null, null, FILE);

        assertThat(command.file()).isEqualTo(FILE);
        assertThat(command.textContent()).isNull();
        assertThatThrownBy(() -> new SendMessageCommand("c-1", ConversationType.DIRECT, "look", null, null,
                CLIENT_MESSAGE_ID, null, null, FILE)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SendMessageCommand("c-1", ConversationType.DIRECT, null, null, null,
                CLIENT_MESSAGE_ID, null, PICTURE, FILE)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void anUnmappedStatusBecomesUnknown() {
        assertThat(new SendMessageResult("m-9", null, null).status()).isEqualTo(MessageStatus.UNKNOWN);
    }

}
