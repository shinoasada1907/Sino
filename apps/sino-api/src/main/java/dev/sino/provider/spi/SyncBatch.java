package dev.sino.provider.spi;

import java.util.List;
import java.util.Objects;

/**
 * One page of changes from {@link MessageProvider#fetchUpdates}. Items that could not be normalized are in
 * {@code skipped} instead of failing the batch. {@code nextCursor} is where the next call continues, also
 * when {@code hasMore} is false.
 */
public record SyncBatch(List<NormalizedConversation> conversations, List<NormalizedMessage> messages,
        List<SkippedItem> skipped, SyncCursor nextCursor, boolean hasMore) {

    public SyncBatch {
        conversations = List.copyOf(Objects.requireNonNull(conversations, "conversations must not be null"));
        messages = List.copyOf(Objects.requireNonNull(messages, "messages must not be null"));
        skipped = List.copyOf(Objects.requireNonNull(skipped, "skipped must not be null"));
        Objects.requireNonNull(nextCursor, "nextCursor must not be null");
    }

}
