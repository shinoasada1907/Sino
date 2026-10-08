package dev.sino.account.api;

import java.io.Serial;
import java.io.Serializable;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Optional;

import dev.sino.account.application.PendingConnect;

/**
 * The connects one browser session has started: each is taken once, lasts ten minutes, and the session keeps the
 * five newest, so several tabs work and nothing piles up. Kept in the HTTP session, never in the database: only the
 * browser that started a connect can finish it. Not thread-safe; callers lock the session.
 */
final class PendingConnects implements Serializable {

    static final String SESSION_ATTRIBUTE = PendingConnects.class.getName();
    static final int MAX_PENDING = 5;
    static final Duration LIFETIME = Duration.ofMinutes(10);

    @Serial
    private static final long serialVersionUID = 1L;

    // Oldest first, so expired connects are always the first to be dropped when the session is full.
    private final LinkedHashMap<String, PendingConnect> byState = new LinkedHashMap<>();

    void add(PendingConnect connect) {
        byState.put(connect.state(), connect);
        while (byState.size() > MAX_PENDING) {
            byState.pollFirstEntry();
        }
    }

    /** Removes the connect whatever happens next, so a state never works twice. */
    Optional<PendingConnect> take(String state, Instant now) {
        if (state == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(byState.remove(state)).filter(pending -> isLive(pending, now));
    }

    private static boolean isLive(PendingConnect pending, Instant now) {
        return now.isBefore(pending.createdAt().plus(LIFETIME));
    }

}
