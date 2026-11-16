package dev.sino.provider;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.QrChallenge;
import dev.sino.provider.spi.QrLogin;
import dev.sino.provider.spi.QrLoginState;

/**
 * A QR login for tests. Each start gives the next {@code login-<n>}; {@link #answer} sets what {@link #status} says for
 * a login, one answer per call, the last one repeating. As with Zalo, {@link QrLoginState.Done} comes once: the login is
 * then forgotten, and so is a cancelled one, and asking about a forgotten or unknown login gives
 * {@link QrLoginState.Failed}.
 */
public final class FakeQrLogin implements QrLogin {

    /** A one-pixel PNG, in base64. */
    public static final String QR_IMAGE =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    private final Map<String, Deque<QrLoginState>> answers = new HashMap<>();
    private final Set<String> live = new HashSet<>();
    private final List<String> asked = new ArrayList<>();
    private final List<String> cancelled = new ArrayList<>();
    private ProviderException startFailure;
    private ProviderException nextStatusFailure;
    private CountDownLatch[] heldStatus;
    private int starts;
    // Never reset, so no test sees the login ID of another.
    private int lastLoginId;

    @Override
    public synchronized QrChallenge start() {
        if (startFailure != null) {
            throw startFailure;
        }
        starts++;
        String loginId = "login-" + ++lastLoginId;
        live.add(loginId);
        return new QrChallenge(loginId, QR_IMAGE, Instant.now().plusSeconds(100));
    }

    @Override
    public QrLoginState status(String loginId) {
        CountDownLatch[] hold;
        synchronized (this) {
            hold = heldStatus;
            heldStatus = null;
        }
        // Outside the lock, so another caller is not kept out by the fake itself.
        if (hold != null) {
            hold[0].countDown();
            await(hold[1]);
        }
        return answerFor(loginId);
    }

    private synchronized QrLoginState answerFor(String loginId) {
        asked.add(loginId);
        if (nextStatusFailure != null) {
            ProviderException failure = nextStatusFailure;
            nextStatusFailure = null;
            throw failure;
        }
        if (!live.contains(loginId)) {
            return new QrLoginState.Failed("unknown login");
        }
        Deque<QrLoginState> queue = answers.computeIfAbsent(loginId, id -> new ArrayDeque<>());
        QrLoginState next = queue.isEmpty() ? new QrLoginState.Waiting() : queue.size() > 1 ? queue.poll() : queue.peek();
        if (next instanceof QrLoginState.Done) {
            live.remove(loginId);
        }
        return next;
    }

    @Override
    public synchronized void cancel(String loginId) {
        cancelled.add(loginId);
        live.remove(loginId);
    }

    /** What {@link #status} says for {@code loginId} from now on, one answer per call, the last one repeating. */
    public synchronized void answer(String loginId, QrLoginState... states) {
        Deque<QrLoginState> queue = answers.computeIfAbsent(loginId, id -> new ArrayDeque<>());
        queue.clear();
        queue.addAll(List.of(states));
    }

    /** Makes every start fail, as a provider that gives no QR code does. */
    public synchronized void failStarts(ProviderException failure) {
        this.startFailure = failure;
    }

    /** Holds the next status call: it counts {@code entered} down, then waits for {@code release} before answering. */
    public synchronized void holdNextStatus(CountDownLatch entered, CountDownLatch release) {
        this.heldStatus = new CountDownLatch[] { entered, release };
    }

    /** Makes the next status call fail, as a provider that does not answer in time does. */
    public synchronized void failNextStatus(ProviderException failure) {
        this.nextStatusFailure = failure;
    }

    public synchronized int starts() {
        return starts;
    }

    public synchronized List<String> asked() {
        return List.copyOf(asked);
    }

    public synchronized List<String> cancelled() {
        return List.copyOf(cancelled);
    }

    /** Forgets the answers, the calls and the failures; login IDs keep counting. */
    public synchronized void reset() {
        starts = 0;
        answers.clear();
        live.clear();
        asked.clear();
        cancelled.clear();
        startFailure = null;
        nextStatusFailure = null;
        heldStatus = null;
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("a held status call was never released");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

}
