package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class SkippedItemTests {

    @Test
    void recordsWhatWasSkippedAndWhy() {
        SkippedItem item = new SkippedItem(SkippedItem.Kind.MESSAGE, "m-2",
                ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, "externalConversationId must not be blank");

        assertThat(item.kind()).isEqualTo(SkippedItem.Kind.MESSAGE);
        assertThat(item.externalId()).isEqualTo("m-2");
        assertThat(item.reason()).isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @Test
    void theExternalIdIsOptional() {
        SkippedItem item = new SkippedItem(SkippedItem.Kind.CONVERSATION, null,
                ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, "externalConversationId must not be blank");

        assertThat(item.externalId()).isNull();
    }

    @Test
    void requiresAKindAndAReason() {
        assertThatThrownBy(() -> new SkippedItem(null, "m-2", ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, "x"))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new SkippedItem(SkippedItem.Kind.MESSAGE, "m-2", null, "x"))
                .isInstanceOf(NullPointerException.class);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void requiresADetail(String detail) {
        assertThatThrownBy(() -> new SkippedItem(SkippedItem.Kind.MESSAGE, "m-2",
                ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, detail))
                .isInstanceOf(IllegalArgumentException.class);
    }

}
