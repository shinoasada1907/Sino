package dev.sino.provider;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ProviderDescriptorTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final ProviderCapabilities READ_ONLY = ProviderCapabilities.of(ProviderCapability.READ_MESSAGES);

    @Test
    void needsEveryPart() {
        assertThatThrownBy(() -> new ProviderDescriptor(null, "Gmail", READ_ONLY))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new ProviderDescriptor(GMAIL, null, READ_ONLY))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new ProviderDescriptor(GMAIL, "Gmail", null))
                .isInstanceOf(NullPointerException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   " })
    void needsADisplayName(String displayName) {
        assertThatThrownBy(() -> new ProviderDescriptor(GMAIL, displayName, READ_ONLY))
                .isInstanceOf(IllegalArgumentException.class);
    }

}
