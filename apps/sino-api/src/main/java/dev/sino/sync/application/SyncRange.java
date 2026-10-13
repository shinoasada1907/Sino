package dev.sino.sync.application;

import java.time.Duration;
import java.time.Instant;

/** How far back the first import reads (step "Đồng bộ" of the canvas). */
public enum SyncRange {

    DAYS_30(Duration.ofDays(30)),
    DAYS_90(Duration.ofDays(90)),
    ALL(null);

    private final Duration back;

    SyncRange(Duration back) {
        this.back = back;
    }

    /** The moment the import reads from; {@code null} for the whole mailbox. */
    public Instant since(Instant now) {
        return back == null ? null : now.minus(back);
    }

}
