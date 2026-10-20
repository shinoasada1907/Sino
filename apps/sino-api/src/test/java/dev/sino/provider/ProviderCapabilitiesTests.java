package dev.sino.provider;

import static dev.sino.provider.ProviderCapability.ATTACHMENTS;
import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_IMAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static dev.sino.provider.ProviderCapability.THREADS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

class ProviderCapabilitiesTests {

    @Test
    void aReadOnlyProviderSupportsReadingAndNothingElse() {
        ProviderCapabilities capabilities = ProviderCapabilities.of(READ_MESSAGES);

        assertThat(capabilities.supports(READ_MESSAGES)).isTrue();
        for (ProviderCapability capability : ProviderCapability.values()) {
            if (capability != READ_MESSAGES) {
                assertThat(capabilities.supports(capability)).isFalse();
            }
        }
    }

    @Test
    void ignoresDuplicatesAndKeepsDeclarationOrder() {
        ProviderCapabilities capabilities = ProviderCapabilities.of(THREADS, READ_MESSAGES, READ_MESSAGES);

        assertThat(capabilities.values()).containsExactly(READ_MESSAGES, THREADS);
    }

    // A connector can send text and still not pictures (Gmail), so sending pictures is a capability of its own (D-349),
    // and it is not what ATTACHMENTS already says (the metadata of files a message carries).
    @Test
    void sendingPicturesIsItsOwnCapabilityDeclaredAfterSendingMessages() {
        assertThat(ProviderCapabilities.of(SEND_MESSAGES).supports(SEND_IMAGES)).isFalse();
        assertThat(ProviderCapabilities.of(SEND_IMAGES).supports(SEND_MESSAGES)).isFalse();
        assertThat(ProviderCapabilities.of(ATTACHMENTS, SEND_IMAGES, SEND_MESSAGES, READ_MESSAGES).values())
                .containsExactly(READ_MESSAGES, SEND_MESSAGES, SEND_IMAGES, ATTACHMENTS);
    }

    @Test
    void emptyWhenNothingIsDeclared() {
        assertThat(ProviderCapabilities.of().values()).isEmpty();
    }

    @Test
    void copiesTheSetItWasGiven() {
        Set<ProviderCapability> original = new HashSet<>();
        original.add(READ_MESSAGES);
        ProviderCapabilities capabilities = new ProviderCapabilities(original);

        original.add(SEND_MESSAGES);

        assertThat(capabilities.supports(SEND_MESSAGES)).isFalse();
    }

    @Test
    void cannotBeChangedFromOutside() {
        ProviderCapabilities capabilities = ProviderCapabilities.of(READ_MESSAGES);

        assertThatThrownBy(() -> capabilities.values().add(SEND_MESSAGES))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void equalsWhenTheSameCapabilitiesAreDeclared() {
        assertThat(ProviderCapabilities.of(READ_MESSAGES, THREADS))
                .isEqualTo(new ProviderCapabilities(Set.of(THREADS, READ_MESSAGES)));
    }

    @Test
    void requirePassesWhenSupported() {
        ProviderCapabilities capabilities = ProviderCapabilities.of(SEND_MESSAGES);

        assertThatNoException().isThrownBy(() -> capabilities.require(SEND_MESSAGES));
    }

    @Test
    void requireFailsWhenNotSupported() {
        ProviderCapabilities capabilities = ProviderCapabilities.of(READ_MESSAGES);

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> capabilities.require(SEND_MESSAGES))
                .withMessageContaining("SEND_MESSAGES")
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
    }

    @Test
    void rejectsNull() {
        assertThatThrownBy(() -> new ProviderCapabilities(null)).isInstanceOf(NullPointerException.class);
    }

}
