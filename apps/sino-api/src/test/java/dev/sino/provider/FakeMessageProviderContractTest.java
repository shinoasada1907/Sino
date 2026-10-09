package dev.sino.provider;

import static dev.sino.provider.FakeMessageProvider.message;
import static dev.sino.provider.FakeMessageProvider.messageWithoutSentAt;
import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageProviderContractTest;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SkippedItem;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

class FakeMessageProviderContractTest {

    private static final ProviderContext CONTEXT = new ProviderContext(UUID.randomUUID(), "fake-account",
            new TokenCredentials("fake-secret-token"));
    private static final Instant SEPTEMBER = Instant.parse("2026-09-01T08:00:00Z");
    private static final Instant OCTOBER = Instant.parse("2026-10-01T08:00:00Z");
    private static final Instant BETWEEN = Instant.parse("2026-09-15T00:00:00Z");

    @Nested
    class ReadOnly extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake")
                .page(message("m-1", SEPTEMBER), message("m-2", OCTOBER))
                .build();

        @Override
        protected MessageProvider provider() {
            return provider;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return FakeMessageProvider.builder("fake")
                    .page(message("m-1"), messageWithoutSentAt("m-2"), message("m-3"))
                    .build();
        }

        @Override
        protected ProviderContext context() {
            return CONTEXT;
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of("m-1", "m-2");
        }

        @Override
        protected Instant since() {
            return BETWEEN;
        }

        @Test
        void aRefusedSendNeverReachesTheProvider() {
            assertThatExceptionOfType(ProviderException.class)
                    .isThrownBy(() -> provider.sendMessage(CONTEXT, new SendMessageCommand("c-1", "hi", null)));
            assertThat(provider.sentMessages()).isEmpty();
        }

    }

    // A connector that only sends: the kit's check that reading is refused without READ_MESSAGES runs on it.
    @Nested
    class SendOnly extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake-sender")
                .capabilities(SEND_MESSAGES)
                .page(message("m-1"))
                .build();

        @Override
        protected MessageProvider provider() {
            return provider;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return provider;
        }

        @Override
        protected ProviderContext context() {
            return CONTEXT;
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of();
        }

        @Override
        protected Instant since() {
            return BETWEEN;
        }

    }

    @Nested
    class Sending extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake-mail")
                .displayName("Fake Mail")
                .capabilities(READ_MESSAGES, SEND_MESSAGES)
                .page(message("m-1", OCTOBER), message("m-2", SEPTEMBER))
                .build();

        @Override
        protected MessageProvider provider() {
            return provider;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return FakeMessageProvider.builder("fake-mail")
                    .capabilities(READ_MESSAGES, SEND_MESSAGES)
                    .page(messageWithoutSentAt("m-1"), message("m-2"), message("m-3"))
                    .build();
        }

        @Override
        protected ProviderContext context() {
            return CONTEXT;
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of("m-1", "m-2");
        }

        @Override
        protected Instant since() {
            return BETWEEN;
        }

    }

    @Test
    void followsItsPages() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake")
                .page(message("m-1"))
                .page(message("m-2"))
                .build();

        SyncBatch first = provider.fetchUpdates(CONTEXT, SyncCursor.initial());
        SyncBatch second = provider.fetchUpdates(CONTEXT, first.nextCursor());
        SyncBatch afterTheEnd = provider.fetchUpdates(CONTEXT, second.nextCursor());

        assertThat(first.hasMore()).isTrue();
        assertThat(second.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("m-2");
        assertThat(second.hasMore()).isFalse();
        assertThat(afterTheEnd.messages()).isEmpty();
        assertThat(afterTheEnd.nextCursor()).isEqualTo(second.nextCursor());
    }

    @Test
    void leavesOutOlderMessagesOnEveryPageOfTheFirstSync() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake")
                .page(message("m-1", SEPTEMBER), message("m-2", OCTOBER))
                .page(message("m-3", SEPTEMBER), message("m-4", BETWEEN), messageWithoutSentAt("m-5"))
                .build();

        SyncBatch first = provider.fetchUpdates(CONTEXT, SyncCursor.initial(BETWEEN));
        SyncBatch second = provider.fetchUpdates(CONTEXT, first.nextCursor());
        SyncBatch afterTheEnd = provider.fetchUpdates(CONTEXT, second.nextCursor());

        assertThat(first.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("m-2");
        assertThat(second.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("m-4");
        assertThat(second.skipped()).extracting(SkippedItem::externalId).containsExactly("m-5");
        assertThat(afterTheEnd.nextCursor()).isEqualTo(second.nextCursor());
    }

    @Test
    void rejectsACursorItDidNotIssue() {
        FakeMessageProvider provider = FakeMessageProvider.builder("fake").page(message("m-1")).build();

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider.fetchUpdates(CONTEXT, new SyncCursor("page-1@yesterday")))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.REQUEST_REJECTED);
    }

}
