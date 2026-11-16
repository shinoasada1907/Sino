package dev.sino.account.api;

import java.io.Serial;
import java.io.Serializable;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Optional;

import dev.sino.account.application.PendingQrConnect;

/**
 * The QR connects one browser session has started, by login ID, like {@link PendingConnects}: each lasts ten minutes,
 * past the code's own life and the polls after it, and the session keeps the five newest. Kept in the HTTP session,
 * never in the database: only the browser that started a login can see or end it. Thread-safe on its own.
 */
final class PendingQrConnects implements Serializable {

    static final String SESSION_ATTRIBUTE = PendingQrConnects.class.getName();
    static final int MAX_PENDING = 5;
    static final Duration LIFETIME = Duration.ofMinutes(10);

    @Serial
    private static final long serialVersionUID = 1L;

    // Oldest first, so the oldest connect is the first to be dropped when the session is full.
    private final LinkedHashMap<String, PendingQrConnect> byLoginId = new LinkedHashMap<>();

    synchronized void add(PendingQrConnect connect) {
        byLoginId.put(connect.loginId(), connect);
        while (byLoginId.size() > MAX_PENDING) {
            byLoginId.pollFirstEntry();
        }
    }

    /** The live connect with this login ID; an expired one is dropped. */
    synchronized Optional<PendingQrConnect> find(String loginId, Instant now) {
        PendingQrConnect pending = byLoginId.get(loginId);
        if (pending != null && !now.isBefore(pending.createdAt().plus(LIFETIME))) {
            byLoginId.remove(loginId);
            return Optional.empty();
        }
        return Optional.ofNullable(pending);
    }

    synchronized Optional<PendingQrConnect> take(String loginId) {
        return Optional.ofNullable(byLoginId.remove(loginId));
    }

}
