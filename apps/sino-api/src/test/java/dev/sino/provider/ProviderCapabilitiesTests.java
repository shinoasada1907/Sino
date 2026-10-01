package dev.sino.provider;

import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static dev.sino.provider.ProviderCapability.THREADS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

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

        assertThatThrownBy(() -> capabilities.require(SEND_MESSAGES))
                .isInstanceOf(UnsupportedOperationException.class)
                .hasMessageContaining("SEND_MESSAGES");
    }

    @Test
    void rejectsNull() {
        assertThatThrownBy(() -> new ProviderCapabilities(null)).isInstanceOf(NullPointerException.class);
    }

}
