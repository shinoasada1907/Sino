package dev.sino.provider.spi;

import java.util.Objects;

/**
 * An item the connector could not normalize and left out of the batch. {@code detail} explains why in logs,
 * so it must not contain the raw payload or personal data.
 */
public record SkippedItem(Kind kind, String externalId, ProviderErrorCode reason, String detail) {

    public SkippedItem {
        Objects.requireNonNull(kind, "kind must not be null");
        Objects.requireNonNull(reason, "reason must not be null");
        if (detail == null || detail.isBlank()) {
            throw new IllegalArgumentException("detail must not be blank");
        }
    }

    public enum Kind {
        CONVERSATION,
        MESSAGE,
        ATTACHMENT
    }

}
