package dev.sino.provider.spi;

import java.time.Instant;

/**
 * Where the last sync stopped. Only the connector understands {@code value}; {@code null} means the first
 * sync has not happened yet. The first sync may start from {@code since}: nothing older is returned, and
 * without it the first sync reads everything the provider allows. Later cursors carry no {@code since}; the
 * connector keeps whatever it needs in {@code value}.
 */
public record SyncCursor(String value, Instant since) {

    private static final SyncCursor INITIAL = new SyncCursor(null, null);

    public SyncCursor {
        if (value != null && value.isBlank()) {
            throw new IllegalArgumentException("value must not be blank");
        }
        if (value != null && since != null) {
            throw new IllegalArgumentException("only the initial cursor has a since");
        }
    }

    public SyncCursor(String value) {
        this(value, null);
    }

    public static SyncCursor initial() {
        return INITIAL;
    }

    /** The first sync from {@code since}, or of everything when it is {@code null}. */
    public static SyncCursor initial(Instant since) {
        return new SyncCursor(null, since);
    }

    public boolean isInitial() {
        return value == null;
    }

}
