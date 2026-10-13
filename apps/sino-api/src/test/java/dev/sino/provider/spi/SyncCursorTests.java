package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SyncCursorTests {

    private static final Instant SINCE = Instant.parse("2026-07-11T00:00:00Z");

    @Test
    void theInitialCursorStartsTheFirstSync() {
        assertThat(SyncCursor.initial().isInitial()).isTrue();
        assertThat(SyncCursor.initial().value()).isNull();
        assertThat(SyncCursor.initial().since()).isNull();
    }

    @Test
    void anInitialCursorWithoutAMomentReadsEverything() {
        assertThat(SyncCursor.initial(null)).isEqualTo(SyncCursor.initial());
    }

    @Test
    void anInitialCursorKeepsItsMoment() {
        SyncCursor cursor = SyncCursor.initial(SINCE);

        assertThat(cursor.isInitial()).isTrue();
        assertThat(cursor.value()).isNull();
        assertThat(cursor.since()).isEqualTo(SINCE);
    }

    @Test
    void aCursorWithAValueIsNotInitial() {
        SyncCursor cursor = new SyncCursor("history-42");

        assertThat(cursor.isInitial()).isFalse();
        assertThat(cursor.value()).isEqualTo("history-42");
        assertThat(cursor.since()).isNull();
    }

    @Test
    void onlyTheInitialCursorHasAMoment() {
        assertThatThrownBy(() -> new SyncCursor("history-42", SINCE)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   " })
    void rejectsABlankValue(String value) {
        assertThatThrownBy(() -> new SyncCursor(value)).isInstanceOf(IllegalArgumentException.class);
    }

}
