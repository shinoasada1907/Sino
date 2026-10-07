package dev.sino.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ProviderTypeTests {

    @Test
    void trimsAndLowerCasesTheValue() {
        ProviderType type = ProviderType.of(" GMAIL ");

        assertThat(type.value()).isEqualTo("gmail");
    }

    @Test
    void equalsByValue() {
        assertThat(ProviderType.of("Gmail")).isEqualTo(ProviderType.of("gmail"));
    }

    @Test
    void printsOnlyTheValue() {
        assertThat(ProviderType.of("gmail")).hasToString("gmail");
    }

    @ParameterizedTest
    @ValueSource(strings = { "gmail", "telegram", "ms-teams", "x1", "a2345678901234567890123456789012" })
    void acceptsValidTypes(String value) {
        assertThat(ProviderType.of(value).value()).isEqualTo(value);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   ", "g", "1gmail", "-gmail", "gmail_x", "gm ail", "a23456789012345678901234567890123" })
    void rejectsInvalidTypes(String value) {
        assertThatThrownBy(() -> ProviderType.of(value))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid provider type");
    }

    @Test
    void rejectsNull() {
        assertThatThrownBy(() -> ProviderType.of(null)).isInstanceOf(NullPointerException.class);
    }

}
