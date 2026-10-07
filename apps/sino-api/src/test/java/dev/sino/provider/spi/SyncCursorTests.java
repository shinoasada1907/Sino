package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SyncCursorTests {

    @Test
    void theInitialCursorStartsTheFirstSync() {
        assertThat(SyncCursor.initial().isInitial()).isTrue();
        assertThat(SyncCursor.initial().value()).isNull();
    }

    @Test
    void aCursorWithAValueIsNotInitial() {
        SyncCursor cursor = new SyncCursor("history-42");

        assertThat(cursor.isInitial()).isFalse();
        assertThat(cursor.value()).isEqualTo("history-42");
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   " })
    void rejectsABlankValue(String value) {
        assertThatThrownBy(() -> new SyncCursor(value)).isInstanceOf(IllegalArgumentException.class);
    }

}
