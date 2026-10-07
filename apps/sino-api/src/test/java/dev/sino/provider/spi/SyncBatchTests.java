package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class SyncBatchTests {

    private static final SyncCursor NEXT = new SyncCursor("history-43");

    @Test
    void keepsMessagesAndSkippedItemsSideBySide() {
        SyncBatch batch = new SyncBatch(List.of(), List.of(message("m-1"), message("m-3")),
                List.of(skipped("m-2")), NEXT, false);

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("m-1", "m-3");
        assertThat(batch.skipped()).extracting(SkippedItem::reason)
                .containsExactly(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        assertThat(batch.nextCursor()).isEqualTo(NEXT);
        assertThat(batch.hasMore()).isFalse();
    }

    @Test
    void rejectsAMissingNextCursor() {
        assertThatThrownBy(() -> new SyncBatch(List.of(), List.of(), List.of(), null, false))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("nextCursor");
    }

    @Test
    void rejectsMissingLists() {
        assertThatThrownBy(() -> new SyncBatch(null, List.of(), List.of(), NEXT, false))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new SyncBatch(List.of(), null, List.of(), NEXT, false))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new SyncBatch(List.of(), List.of(), null, NEXT, false))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void copiesTheLists() {
        List<NormalizedMessage> messages = new ArrayList<>(List.of(message("m-1")));
        SyncBatch batch = new SyncBatch(List.of(), messages, List.of(), NEXT, true);

        messages.add(message("m-2"));

        assertThat(batch.messages()).hasSize(1);
        assertThatThrownBy(() -> batch.messages().add(message("m-3")))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    private static NormalizedMessage message(String externalMessageId) {
        return new NormalizedMessage(externalMessageId, "c-1", "alice", MessageDirection.INBOUND, MessageType.TEXT,
                "hi", MessageStatus.SENT, false, null, Instant.parse("2026-10-01T08:00:00Z"), List.of(), Map.of());
    }

    private static SkippedItem skipped(String externalId) {
        return new SkippedItem(SkippedItem.Kind.MESSAGE, externalId, ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                "sentAt must not be null");
    }

}
