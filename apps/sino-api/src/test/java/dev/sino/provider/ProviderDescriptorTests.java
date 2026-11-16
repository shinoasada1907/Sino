package dev.sino.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ProviderDescriptorTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final ProviderCapabilities READ_ONLY = ProviderCapabilities.of(ProviderCapability.READ_MESSAGES);

    @Test
    void needsEveryPart() {
        assertThatThrownBy(() -> new ProviderDescriptor(null, "Gmail", ProviderKind.EMAIL, READ_ONLY,
                ConnectMethod.OAUTH2, true)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new ProviderDescriptor(GMAIL, null, ProviderKind.EMAIL, READ_ONLY,
                ConnectMethod.OAUTH2, true)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new ProviderDescriptor(GMAIL, "Gmail", null, READ_ONLY, ConnectMethod.OAUTH2, true))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("kind must not be null");
        assertThatThrownBy(() -> new ProviderDescriptor(GMAIL, "Gmail", ProviderKind.EMAIL, null,
                ConnectMethod.OAUTH2, true)).isInstanceOf(NullPointerException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   " })
    void needsADisplayName(String displayName) {
        assertThatThrownBy(() -> new ProviderDescriptor(GMAIL, displayName, ProviderKind.EMAIL, READ_ONLY,
                ConnectMethod.OAUTH2, true)).isInstanceOf(IllegalArgumentException.class);
    }

    // A provider without a connect flow, such as a connector that only reads, cannot be connected (D-285).
    @Test
    void aProviderWithoutAConnectMethodIsNotConnectable() {
        assertThat(new ProviderDescriptor(GMAIL, "Gmail", ProviderKind.EMAIL, READ_ONLY, null, false).connectMethod())
                .isNull();
        assertThatThrownBy(() -> new ProviderDescriptor(GMAIL, "Gmail", ProviderKind.EMAIL, READ_ONLY, null, true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("connect method");
    }

}
