package dev.sino.realtime.application;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter.SseEventBuilder;

/**
 * The open event streams of the signed-in users (F08, D-77), at most a few per user. Each stream has its own queue
 * and virtual thread to write to the network, so a slow browser never holds up the code that publishes. A stream that
 * cannot keep up, fails to write, or reaches its timeout is closed; the browser connects again and reads the data
 * afresh, so nothing has to be replayed.
 */
@Component
public class EventHub implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(EventHub.class);
    private static final int QUEUED_EVENTS = 100;
    private static final long WRITER_WAKE_UP_MILLIS = 500;

    private final RealtimeProperties properties;
    // The streams of each owner, oldest first. A deque is only changed inside compute on its key, so adding and
    // removing streams of one owner never interleave.
    private final Map<UUID, Deque<Stream>> streams = new ConcurrentHashMap<>();
    private final ThreadFactory writers = Thread.ofVirtual().name("event-stream-", 0).factory();
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon().name("event-stream-heartbeat").factory());

    EventHub(RealtimeProperties properties) {
        this.properties = properties;
        long every = properties.heartbeat().toMillis();
        heartbeat.scheduleAtFixedRate(this::beat, every, every, TimeUnit.MILLISECONDS);
    }

    /**
     * A new stream of the user. It starts with the reconnect delay for the browser; when the user has more than the
     * allowed number of streams, the oldest ones are closed.
     */
    public SseEmitter open(UUID ownerId) {
        SseEmitter emitter = new SseEmitter(properties.streamTimeout().toMillis());
        Stream stream = new Stream(ownerId, emitter);
        List<Stream> tooMany = new ArrayList<>();
        streams.compute(ownerId, (id, ofOwner) -> {
            Deque<Stream> open = ofOwner == null ? new ArrayDeque<>() : ofOwner;
            open.addLast(stream);
            while (open.size() > properties.maxStreamsPerUser()) {
                tooMany.add(open.pollFirst());
            }
            return open;
        });
        tooMany.forEach(Stream::close);
        emitter.onCompletion(stream::close);
        emitter.onTimeout(stream::close);
        emitter.onError(failure -> stream.close());
        stream.send(SseEmitter.event().reconnectTime(properties.reconnect().toMillis()).comment("connected"));
        return emitter;
    }

    /** Sends the event to every open stream of the user; {@code type} is both the SSE event name and its data. */
    public void publish(UUID ownerId, String type, Object data) {
        streamsOf(ownerId).forEach(stream -> stream.send(
                SseEmitter.event().name(type).data(data, MediaType.APPLICATION_JSON)));
    }

    /**
     * Closes every stream as soon as the application starts closing, before the web server's graceful shutdown,
     * which would otherwise wait for these never-ending requests.
     */
    @EventListener(ContextClosedEvent.class)
    void closeAll() {
        streams.keySet().forEach(owner -> streamsOf(owner).forEach(Stream::close));
    }

    @Override
    public void destroy() {
        heartbeat.shutdownNow();
        closeAll();
    }

    private List<Stream> streamsOf(UUID ownerId) {
        List<Stream> copy = new ArrayList<>();
        streams.computeIfPresent(ownerId, (id, ofOwner) -> {
            copy.addAll(ofOwner);
            return ofOwner;
        });
        return copy;
    }

    // A comment line keeps proxies from closing a quiet stream, and shows a closed browser by failing to write. An
    // exception here would cancel every later beat, so none leaves.
    private void beat() {
        try {
            streams.keySet().forEach(owner -> streamsOf(owner).forEach(stream -> stream.send(
                    SseEmitter.event().comment(""))));
        } catch (RuntimeException failure) {
            log.warn("The heartbeat of the event streams failed", failure);
        }
    }

    private final class Stream {

        private final UUID ownerId;
        private final SseEmitter emitter;
        private final BlockingQueue<SseEventBuilder> queue = new ArrayBlockingQueue<>(QUEUED_EVENTS);
        private final AtomicBoolean closed = new AtomicBoolean();

        private Stream(UUID ownerId, SseEmitter emitter) {
            this.ownerId = ownerId;
            this.emitter = emitter;
            writers.newThread(this::write).start();
        }

        private void send(SseEventBuilder event) {
            if (!closed.get() && !queue.offer(event)) {
                log.debug("An event stream of user {} falls behind and is closed", ownerId);
                close();
            }
        }

        // Stops on the flag, checked at least twice a second, rather than on an interrupt the network code may eat.
        private void write() {
            try {
                while (!closed.get()) {
                    SseEventBuilder event = queue.poll(WRITER_WAKE_UP_MILLIS, TimeUnit.MILLISECONDS);
                    if (event != null && !closed.get()) {
                        emitter.send(event);
                    }
                }
            } catch (InterruptedException stopping) {
                Thread.currentThread().interrupt();
            } catch (IOException | RuntimeException gone) {
                // The browser went away or the stream ended: nothing to tell anyone.
                close();
            }
        }

        private void close() {
            if (!closed.compareAndSet(false, true)) {
                return;
            }
            streams.computeIfPresent(ownerId, (id, ofOwner) -> {
                ofOwner.remove(this);
                return ofOwner.isEmpty() ? null : ofOwner;
            });
            try {
                emitter.complete();
            } catch (RuntimeException alreadyDone) {
                // Completed or failed already.
            }
        }

    }

}
