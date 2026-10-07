package dev.sino.identity.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Failed sign-ins per email (D-35): five in a row lock the email for fifteen minutes. Unknown emails are counted
 * too, so the answers do not tell which emails exist. Kept in memory: a restart forgets everything, which is fine
 * for the MVP. Bounded, so a flood of made-up emails cannot fill the memory.
 */
@Component
class LoginAttempts {

    static final int MAX_FAILURES = 5;
    static final Duration LOCK_TIME = Duration.ofMinutes(15);
    static final Duration FORGET_AFTER = Duration.ofMinutes(15);
    static final int MAX_EMAILS = 10_000;

    private final Clock clock;
    private final int maxEmails;
    // In order of the last failure, oldest first.
    private final LinkedHashMap<String, Entry> entries = new LinkedHashMap<>();

    @Autowired
    LoginAttempts(Clock clock) {
        this(clock, MAX_EMAILS);
    }

    LoginAttempts(Clock clock, int maxEmails) {
        this.clock = clock;
        this.maxEmails = maxEmails;
    }

    /** How long the email stays locked, or empty when it is not locked. */
    synchronized Optional<Duration> lockedFor(String email) {
        Instant now = clock.instant();
        Entry entry = current(OwnerProperties.normalizeEmail(email), now);
        if (entry == null || entry.lockedUntil() == null) {
            return Optional.empty();
        }
        return Optional.of(Duration.between(now, entry.lockedUntil()));
    }

    /** @return how many attempts are left before the lock; 0 means this failure locked the email */
    synchronized int recordFailure(String email) {
        String key = OwnerProperties.normalizeEmail(email);
        Instant now = clock.instant();
        Entry previous = current(key, now);
        int failures = (previous == null ? 0 : previous.failures()) + 1;
        Instant lockedUntil = failures >= MAX_FAILURES ? now.plus(LOCK_TIME) : null;
        entries.remove(key);
        entries.put(key, new Entry(failures, now, lockedUntil));
        forgetTheOldestWhenFull(now);
        return Math.max(0, MAX_FAILURES - failures);
    }

    synchronized void recordSuccess(String email) {
        entries.remove(OwnerProperties.normalizeEmail(email));
    }

    // The live entry of the email; one whose lock or memory ran out is dropped.
    private Entry current(String key, Instant now) {
        Entry entry = entries.get(key);
        if (entry != null && !entry.isLive(now)) {
            entries.remove(key);
            return null;
        }
        return entry;
    }

    // A lock is never pushed out by other emails; otherwise anybody could end it with a flood of made-up emails.
    private void forgetTheOldestWhenFull(Instant now) {
        if (entries.size() <= maxEmails) {
            return;
        }
        Iterator<Map.Entry<String, Entry>> oldestFirst = entries.entrySet().iterator();
        while (oldestFirst.hasNext()) {
            if (!oldestFirst.next().getValue().isLocked(now)) {
                oldestFirst.remove();
                return;
            }
        }
        entries.remove(entries.keySet().iterator().next());
    }

    private record Entry(int failures, Instant lastFailure, Instant lockedUntil) {

        boolean isLocked(Instant now) {
            return lockedUntil != null && now.isBefore(lockedUntil);
        }

        boolean isLive(Instant now) {
            return lockedUntil != null ? now.isBefore(lockedUntil) : now.isBefore(lastFailure.plus(FORGET_AFTER));
        }

    }

}
