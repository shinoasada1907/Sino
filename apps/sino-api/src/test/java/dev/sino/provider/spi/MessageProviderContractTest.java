package dev.sino.provider.spi;

import static dev.sino.provider.ProviderCapability.PUSH_WEBHOOK;
import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_FILES;
import static dev.sino.provider.ProviderCapability.SEND_IMAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/**
 * Checks every connector must pass. A connector's test extends this class and supplies the connector, a
 * context and the data its fake provider returns.
 */
public abstract class MessageProviderContractTest {

    /** The connector under test; the same instance on every call within one test. */
    protected abstract MessageProvider provider();

    /**
     * The same connector, set up so that the first page has three messages and one misses required data. Only
     * used when the connector declares {@code READ_MESSAGES}.
     */
    protected abstract MessageProvider providerWithOneBrokenMessage();

    /** A context the connector accepts; its secret must be distinctive (at least 8 characters). */
    protected abstract ProviderContext context();

    /**
     * External IDs of the messages the first sync of {@link #provider()} returns; none may be skipped. Only used
     * when the connector declares {@code READ_MESSAGES}.
     */
    protected abstract Set<String> expectedMessageIds();

    /**
     * A moment between the sample messages of {@link #provider()}: the first sync from it keeps at least one of
     * them and leaves out at least one. Only used when the connector declares {@code READ_MESSAGES}.
     */
    protected abstract Instant since();

    /** What the send checks send; override when the fake provider needs a known conversation. */
    protected SendMessageCommand sendCommand() {
        return new SendMessageCommand("conversation-1", "Hello from the contract test", null,
                List.of(new NormalizedRecipients.Address(null, "someone@example.test")), UUID.randomUUID(), null);
    }

    /** What the picture checks send; override when the fake provider needs a known conversation. */
    protected SendMessageCommand imageCommand() {
        return new SendMessageCommand("conversation-1", ConversationType.DIRECT, null, null, List.of(),
                UUID.randomUUID(), null,
                new OutgoingImage(new byte[] {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3, 4}, "image/png", "sticker.png", 64, 64));
    }

    /** What the file checks send (zalo-send-files); override when the fake provider needs a known conversation. */
    protected SendMessageCommand fileCommand() {
        return new SendMessageCommand("conversation-1", ConversationType.DIRECT, null, null, List.of(),
                UUID.randomUUID(), null, null,
                new OutgoingFile("%PDF-1.7 contract".getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                        "application/pdf", "contract.pdf", OutgoingFile.Kind.FILE));
    }

    @Test
    void declaresWhoItIsAndWhatItCanDo() {
        assertThat(provider().type()).isNotNull();
        assertThat(provider().displayName()).isNotBlank();
        assertThat(provider().capabilities()).isNotNull();
    }

    @Test
    void refusesToSendWithoutTheCapability() {
        assumeFalse(provider().capabilities().supports(SEND_MESSAGES), "the connector can send");

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider().sendMessage(context(), sendCommand()))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
    }

    @Test
    void sendsWhenItDeclaresTheCapability() {
        assumeTrue(provider().capabilities().supports(SEND_MESSAGES), "the connector cannot send");

        SendMessageResult result = provider().sendMessage(context(), sendCommand());

        assertThat(result.externalMessageId()).isNotBlank();
        assertThat(result.status()).isNotEqualTo(MessageStatus.FAILED);
    }

    // A connector that sends text can still be one that cannot send a picture (Gmail): it refuses, and sends nothing.
    @Test
    void refusesToSendAPictureWithoutTheCapability() {
        assumeFalse(provider().capabilities().supports(SEND_IMAGES), "the connector sends pictures");

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider().sendMessage(context(), imageCommand()))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
    }

    @Test
    void sendsAPictureWhenItDeclaresTheCapability() {
        assumeTrue(provider().capabilities().supports(SEND_IMAGES), "the connector cannot send pictures");

        SendMessageResult result = provider().sendMessage(context(), imageCommand());

        assertThat(result.externalMessageId()).isNotBlank();
        assertThat(result.status()).isNotEqualTo(MessageStatus.FAILED);
    }

    @Test
    void aConnectorThatSendsPicturesAlsoSendsMessages() {
        assumeTrue(provider().capabilities().supports(SEND_IMAGES), "the connector cannot send pictures");

        assertThat(provider().capabilities().supports(SEND_MESSAGES)).isTrue();
    }

    // A file from the user's computer is refused where the connector cannot send one (Gmail today), and nothing is sent.
    @Test
    void refusesToSendAFileWithoutTheCapability() {
        assumeFalse(provider().capabilities().supports(SEND_FILES), "the connector sends files");

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider().sendMessage(context(), fileCommand()))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
    }

    @Test
    void sendsAFileWhenItDeclaresTheCapability() {
        assumeTrue(provider().capabilities().supports(SEND_FILES), "the connector cannot send files");

        SendMessageResult result = provider().sendMessage(context(), fileCommand());

        assertThat(result.externalMessageId()).isNotBlank();
        assertThat(result.status()).isNotEqualTo(MessageStatus.FAILED);
    }

    @Test
    void aConnectorThatSendsFilesAlsoSendsMessages() {
        assumeTrue(provider().capabilities().supports(SEND_FILES), "the connector cannot send files");

        assertThat(provider().capabilities().supports(SEND_MESSAGES)).isTrue();
    }

    @Test
    void refusesToSyncWithoutTheCapability() {
        assumeFalse(provider().capabilities().supports(READ_MESSAGES), "the connector can read messages");

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider().fetchUpdates(context(), SyncCursor.initial()))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
    }

    @Test
    void theFirstSyncReturnsTheSampleMessagesAndACursor() {
        assumeTrue(provider().capabilities().supports(READ_MESSAGES), "the connector cannot read messages");
        SyncBatch batch = provider().fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.nextCursor()).isNotNull();
        assertThat(messageIds(batch)).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(expectedMessageIds());
        assertThat(batch.conversations()).extracting(NormalizedConversation::externalConversationId)
                .doesNotHaveDuplicates();
        assertThat(batch.skipped()).isEmpty();
    }

    @Test
    void theSameCursorReturnsTheSameIds() {
        assumeTrue(provider().capabilities().supports(READ_MESSAGES), "the connector cannot read messages");
        SyncBatch first = provider().fetchUpdates(context(), SyncCursor.initial());
        SyncBatch again = provider().fetchUpdates(context(), SyncCursor.initial());

        assertThat(messageIds(again)).containsExactlyInAnyOrderElementsOf(messageIds(first));
    }

    @Test
    void theFirstSyncFromAMomentLeavesOutOlderItems() {
        assumeTrue(provider().capabilities().supports(READ_MESSAGES), "the connector cannot read messages");
        Instant since = since();
        SyncBatch batch = provider().fetchUpdates(context(), SyncCursor.initial(since));

        assertThat(messageIds(batch)).as("only the sample messages from the moment on").isNotEmpty()
                .isSubsetOf(expectedMessageIds()).hasSizeLessThan(expectedMessageIds().size());
        assertThat(batch.messages()).allSatisfy(message -> assertThat(message.sentAt()).isAfterOrEqualTo(since));
        assertThat(batch.conversations()).map(NormalizedConversation::lastActivityAt).filteredOn(Objects::nonNull)
                .allSatisfy(lastActivityAt -> assertThat(lastActivityAt).isAfterOrEqualTo(since));
    }

    @Test
    void anEstimateIsEmptyOrNotNegative() {
        assumeTrue(provider().capabilities().supports(READ_MESSAGES), "the connector cannot read messages");

        assertThat(List.of(provider().estimateMessages(context(), null),
                provider().estimateMessages(context(), since())))
                .allSatisfy(estimate -> assertThat(estimate.orElse(0)).isNotNegative());
    }

    @Test
    void aConnectorThatCannotReadEstimatesNothing() {
        assumeFalse(provider().capabilities().supports(READ_MESSAGES), "the connector can read messages");

        assertThat(provider().estimateMessages(context(), null)).isEmpty();
        assertThat(provider().estimateMessages(context(), Instant.parse("2026-07-01T00:00:00Z"))).isEmpty();
    }

    @Test
    void aBrokenMessageIsSkippedAndTheOthersAreKept() {
        assumeTrue(provider().capabilities().supports(READ_MESSAGES), "the connector cannot read messages");
        SyncBatch batch = providerWithOneBrokenMessage().fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.messages()).hasSize(2);
        assertThat(batch.skipped()).singleElement().satisfies(item -> {
            assertThat(item.kind()).isEqualTo(SkippedItem.Kind.MESSAGE);
            assertThat(item.reason()).isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        });
    }

    @Test
    void aConnectorWithoutPushRegistersNothing() {
        assumeFalse(provider().capabilities().supports(PUSH_WEBHOOK), "the connector can register for push");

        assertThat(provider().registerPush(context())).isEmpty();
    }

    @Test
    void aConnectorWithPushSaysWhatItsNoticesCarryAndUntilWhen() {
        assumeTrue(provider().capabilities().supports(PUSH_WEBHOOK), "the connector cannot register for push");

        PushRegistration registration = provider().registerPush(context()).orElseThrow();

        assertThat(registration.address()).isNotBlank();
        assertThat(registration.expiresAt()).isAfter(Instant.now());
    }

    @Test
    void theContextNeverShowsTheSecret() {
        ProviderContext context = context();
        String secret = secretOf(context.credentials());

        assertThat(secret).as("the sample secret").hasSizeGreaterThanOrEqualTo(8);
        assertThat(context.toString()).doesNotContain(secret);
    }

    private static List<String> messageIds(SyncBatch batch) {
        return batch.messages().stream().map(NormalizedMessage::externalMessageId).toList();
    }

    private static String secretOf(ProviderCredentials credentials) {
        return switch (credentials) {
            case OAuth2Credentials oauth -> oauth.accessToken();
            case TokenCredentials token -> token.token();
        };
    }

}
