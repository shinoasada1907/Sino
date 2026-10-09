package dev.sino.sync;

import java.time.Instant;
import java.util.List;
import java.util.OptionalLong;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * The connector of the import tests: one bean whose answers each test sets with {@link #use}, which remembers the
 * cursors it was asked for and can hold one call until the test lets it go, or interrupts it as a closing application
 * does. An interrupted call fails the way a real connector's network call does: the provider is unavailable.
 */
final class ScriptedProvider implements MessageProvider {

    static final ProviderType TYPE = ProviderType.of("fake-sync");

    private volatile MessageProvider delegate = FakeMessageProvider.builder(TYPE.value()).build();
    private volatile Thread heldThread;
    private final List<SyncCursor> asked = new CopyOnWriteArrayList<>();
    private final AtomicInteger calls = new AtomicInteger();
    private volatile int heldCall;
    private volatile CountDownLatch release = new CountDownLatch(0);
    private volatile CountDownLatch reached = new CountDownLatch(0);

    void use(MessageProvider provider) {
        delegate = provider;
        asked.clear();
        calls.set(0);
        heldCall = 0;
        release = new CountDownLatch(0);
        reached = new CountDownLatch(0);
    }

    /** Call number {@code call} (from 1) waits for {@link #letGo()}; {@link #awaitHeld()} waits until it is there. */
    void hold(int call) {
        heldCall = call;
        release = new CountDownLatch(1);
        reached = new CountDownLatch(1);
    }

    void awaitHeld() throws InterruptedException {
        if (!reached.await(10, TimeUnit.SECONDS)) {
            throw new IllegalStateException("The held call never came");
        }
    }

    void letGo() {
        release.countDown();
    }

    /** Interrupts the thread of the held call, as {@code shutdownNow()} does when the application closes. */
    void interruptHeld() {
        heldThread.interrupt();
    }

    List<SyncCursor> asked() {
        return List.copyOf(asked);
    }

    @Override
    public ProviderType type() {
        return TYPE;
    }

    @Override
    public ProviderCapabilities capabilities() {
        return ProviderCapabilities.of(ProviderCapability.READ_MESSAGES);
    }

    @Override
    public AccountProfile getAccountProfile(ProviderContext context) {
        return delegate.getAccountProfile(context);
    }

    @Override
    public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
        asked.add(cursor);
        if (calls.incrementAndGet() == heldCall) {
            heldThread = Thread.currentThread();
            reached.countDown();
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "The call was interrupted");
            }
        }
        return delegate.fetchUpdates(context, cursor);
    }

    @Override
    public OptionalLong estimateMessages(ProviderContext context, Instant since) {
        return delegate.estimateMessages(context, since);
    }

}
