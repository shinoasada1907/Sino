package dev.sino.provider;

import static dev.sino.provider.FakeMessageProvider.message;
import static dev.sino.provider.FakeMessageProvider.messageWithoutSentAt;
import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageProviderContractTest;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

class FakeMessageProviderContractTest {

    private static final ProviderContext CONTEXT = new ProviderContext(UUID.randomUUID(), "fake-account",
            new TokenCredentials("fake-secret-token"));

    @Nested
    class ReadOnly extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake")
                .page(message("m-1"), message("m-2"))
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

        @Test
        void aRefusedSendNeverReachesTheProvider() {
            assertThatExceptionOfType(ProviderException.class)
                    .isThrownBy(() -> provider.sendMessage(CONTEXT, new SendMessageCommand("c-1", "hi", null)));
            assertThat(provider.sentMessages()).isEmpty();
        }

    }

    @Nested
    class Sending extends MessageProviderContractTest {

        private final FakeMessageProvider provider = FakeMessageProvider.builder("fake-mail")
                .displayName("Fake Mail")
                .capabilities(READ_MESSAGES, SEND_MESSAGES)
                .page(message("m-1"))
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
            return Set.of("m-1");
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

}
