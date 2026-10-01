package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;

class MessageProviderTests {

    private final MessageProvider readOnly = new MessageProvider() {

        @Override
        public ProviderType type() {
            return ProviderType.of("read-only");
        }

        @Override
        public ProviderCapabilities capabilities() {
            return ProviderCapabilities.of(ProviderCapability.READ_MESSAGES);
        }

        @Override
        public AccountProfile getAccountProfile(ProviderContext context) {
            return new AccountProfile("alice", "Alice", null);
        }

        @Override
        public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
            return new SyncBatch(List.of(), List.of(), List.of(), new SyncCursor("end"), false);
        }

    };

    @Test
    void aConnectorWithoutSendingRefusesToSend() {
        ProviderContext context = new ProviderContext(UUID.randomUUID(), "alice", new TokenCredentials("t"));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> readOnly.sendMessage(context, new SendMessageCommand("c-1", "hello", null)))
                .withMessageContaining("read-only")
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
    }

}
