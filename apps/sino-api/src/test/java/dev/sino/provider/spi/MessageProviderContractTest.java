package dev.sino.provider.spi;

import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

/**
 * Checks every connector must pass. A connector's test extends this class and supplies the connector, a
 * context and the data its fake provider returns.
 */
public abstract class MessageProviderContractTest {

    /** The connector under test; the same instance on every call within one test. */
    protected abstract MessageProvider provider();

    /** The same connector, set up so that the first page has three messages and one misses required data. */
    protected abstract MessageProvider providerWithOneBrokenMessage();

    /** A context the connector accepts; its secret must be distinctive (at least 8 characters). */
    protected abstract ProviderContext context();

    /** External IDs of the messages the first sync of {@link #provider()} returns; none may be skipped. */
    protected abstract Set<String> expectedMessageIds();

    /** What the send checks send; override when the fake provider needs a known conversation. */
    protected SendMessageCommand sendCommand() {
        return new SendMessageCommand("conversation-1", "Hello from the contract test", null);
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

    @Test
    void theFirstSyncReturnsTheSampleMessagesAndACursor() {
        SyncBatch batch = provider().fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.nextCursor()).isNotNull();
        assertThat(messageIds(batch)).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(expectedMessageIds());
        assertThat(batch.conversations()).extracting(NormalizedConversation::externalConversationId)
                .doesNotHaveDuplicates();
        assertThat(batch.skipped()).isEmpty();
    }

    @Test
    void theSameCursorReturnsTheSameIds() {
        SyncBatch first = provider().fetchUpdates(context(), SyncCursor.initial());
        SyncBatch again = provider().fetchUpdates(context(), SyncCursor.initial());

        assertThat(messageIds(again)).containsExactlyInAnyOrderElementsOf(messageIds(first));
    }

    @Test
    void aBrokenMessageIsSkippedAndTheOthersAreKept() {
        SyncBatch batch = providerWithOneBrokenMessage().fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.messages()).hasSize(2);
        assertThat(batch.skipped()).singleElement().satisfies(item -> {
            assertThat(item.kind()).isEqualTo(SkippedItem.Kind.MESSAGE);
            assertThat(item.reason()).isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        });
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
