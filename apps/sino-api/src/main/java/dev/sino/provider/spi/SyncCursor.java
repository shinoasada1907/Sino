package dev.sino.provider.spi;

/**
 * Where the last sync stopped. Only the connector understands {@code value}; {@code null} means the first
 * sync has not happened yet.
 */
public record SyncCursor(String value) {

    private static final SyncCursor INITIAL = new SyncCursor(null);

    public SyncCursor {
        if (value != null && value.isBlank()) {
            throw new IllegalArgumentException("value must not be blank");
        }
    }

    public static SyncCursor initial() {
        return INITIAL;
    }

    public boolean isInitial() {
        return value == null;
    }

}
