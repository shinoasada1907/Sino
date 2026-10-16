package dev.sino.provider;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.AttachmentContent;
import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.OAuth2Connection;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.PushRegistration;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SendMessageResult;
import dev.sino.provider.spi.SkippedItem;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * A connector for tests, configured with a type, capabilities and the pages of raw messages its provider
 * returns. Like a real connector it normalizes each raw message and skips the ones missing required data, and
 * a first sync from a moment leaves out the messages sent before it. Cursors are {@code page-<n>}, where
 * {@code n} is the next page to return, followed by {@code @<since>} when the first sync started from a moment.
 * Given a push registration or failure, it also declares {@code PUSH_WEBHOOK}.
 */
public final class FakeMessageProvider implements MessageProvider {

    private static final Pattern CURSOR = Pattern.compile("page-(\\d{1,4})(?:@(.+))?");
    private static final Instant SENT_AT = Instant.parse("2026-10-01T08:00:00Z");

    private final ProviderType type;
    private final String displayName;
    private final ProviderCapabilities capabilities;
    private final List<List<RawMessage>> pages;
    private final OAuth2Connection oauth2;
    private final Long estimate;
    private final ProviderException estimateFailure;
    private final Map<Integer, ProviderException> failures;
    private final PushRegistration push;
    private final ProviderException pushFailure;
    private final Map<String, MessageContent> contents;
    private final ProviderException contentFailure;
    private final Map<String, AttachmentContent> files;
    private final ProviderException fileFailure;
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicInteger pushCalls = new AtomicInteger();
    private final AtomicInteger contentCalls = new AtomicInteger();
    private final AtomicInteger fileCalls = new AtomicInteger();
    private final List<SendMessageCommand> sent = new ArrayList<>();
    private final Queue<ProviderException> sendFailures = new ArrayDeque<>();
    private final Map<UUID, List<String>> foundSends = new HashMap<>();
    private final List<Search> searches = new ArrayList<>();
    private CountDownLatch[] held;
    private boolean findsSends = true;

    private FakeMessageProvider(Builder builder) {
        this.type = builder.type;
        this.displayName = builder.displayName;
        this.push = builder.push;
        this.pushFailure = builder.pushFailure;
        this.capabilities = push == null && pushFailure == null ? builder.capabilities
                : withPush(builder.capabilities);
        this.pages = List.copyOf(builder.pages);
        this.oauth2 = builder.oauth2;
        this.estimate = builder.estimate;
        this.estimateFailure = builder.estimateFailure;
        this.failures = Map.copyOf(builder.failures);
        this.contents = Map.copyOf(builder.contents);
        this.contentFailure = builder.contentFailure;
        this.files = Map.copyOf(builder.files);
        this.fileFailure = builder.fileFailure;
    }

    public static Builder builder(String type) {
        return new Builder(type);
    }

    public static RawMessage message(String externalMessageId) {
        return message(externalMessageId, SENT_AT);
    }

    public static RawMessage message(String externalMessageId, Instant sentAt) {
        return new RawMessage(externalMessageId, "conversation-1", sentAt, "Message " + externalMessageId);
    }

    /** A message the fake cannot normalize because {@code sentAt} is missing. */
    public static RawMessage messageWithoutSentAt(String externalMessageId) {
        return new RawMessage(externalMessageId, "conversation-1", null, "Message " + externalMessageId);
    }

    @Override
    public ProviderType type() {
        return type;
    }

    @Override
    public String displayName() {
        return displayName != null ? displayName : MessageProvider.super.displayName();
    }

    @Override
    public ProviderKind kind() {
        return ProviderKind.EMAIL;
    }

    @Override
    public ProviderCapabilities capabilities() {
        return capabilities;
    }

    @Override
    public Optional<OAuth2Connection> oauth2() {
        return Optional.ofNullable(oauth2);
    }

    @Override
    public AccountProfile getAccountProfile(ProviderContext context) {
        return new AccountProfile("fake-account", "Fake Account", null, null);
    }

    @Override
    public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
        if (!capabilities.supports(ProviderCapability.READ_MESSAGES)) {
            throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                    type + " does not support " + ProviderCapability.READ_MESSAGES);
        }
        ProviderException failure = failures.get(calls.incrementAndGet());
        if (failure != null) {
            throw failure;
        }
        Position position = position(cursor);
        int page = position.page();
        if (page >= pages.size()) {
            return new SyncBatch(List.of(), List.of(), List.of(), position.at(pages.size()), false);
        }
        List<NormalizedMessage> messages = new ArrayList<>();
        List<SkippedItem> skipped = new ArrayList<>();
        for (RawMessage raw : pages.get(page)) {
            if (position.leavesOut(raw)) {
                continue;
            }
            try {
                messages.add(normalize(raw));
            } catch (ProviderException e) {
                if (e.errorCode() != ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED) {
                    throw e;
                }
                skipped.add(new SkippedItem(SkippedItem.Kind.MESSAGE, raw.externalMessageId(), e.errorCode(),
                        e.getMessage()));
            }
        }
        int next = page + 1;
        return new SyncBatch(List.of(), messages, skipped, position.at(next), next < pages.size());
    }

    @Override
    public OptionalLong estimateMessages(ProviderContext context, Instant since) {
        if (!capabilities.supports(ProviderCapability.READ_MESSAGES)) {
            return OptionalLong.empty();
        }
        if (estimateFailure != null) {
            throw estimateFailure;
        }
        if (estimate == null) {
            return OptionalLong.empty();
        }
        return OptionalLong.of(estimate);
    }

    /**
     * Answers with {@code sent-<n>}, the n-th send since the last {@link #forgetSends()}, unless told to fail. A send
     * held by {@link #holdNextSend} waits outside the lock of this fake, so other calls go on meanwhile.
     */
    @Override
    public SendMessageResult sendMessage(ProviderContext context, SendMessageCommand command) {
        if (!capabilities.supports(ProviderCapability.SEND_MESSAGES)) {
            return MessageProvider.super.sendMessage(context, command);
        }
        CountDownLatch[] hold;
        int number;
        ProviderException failure;
        synchronized (this) {
            sent.add(command);
            number = sent.size();
            failure = sendFailures.poll();
            hold = held;
            held = null;
        }
        if (hold != null) {
            hold[0].countDown();
            try {
                hold[1].await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        if (failure != null) {
            throw failure;
        }
        return new SendMessageResult("sent-" + number, MessageStatus.SENT, null);
    }

    @Override
    public synchronized List<String> findSentMessages(ProviderContext context, SendMessageCommand command,
            Instant startedAt) {
        searches.add(new Search(command, startedAt));
        if (!findsSends) {
            return MessageProvider.super.findSentMessages(context, command, startedAt);
        }
        return foundSends.getOrDefault(command.clientMessageId(), List.of());
    }

    /** The next send counts {@code entered} down, then waits for {@code release} before it answers. */
    public synchronized void holdNextSend(CountDownLatch entered, CountDownLatch release) {
        held = new CountDownLatch[] { entered, release };
    }

    /** {@code false}: {@link #findSentMessages} cannot tell, as a connector without it does. */
    public synchronized void findsSends(boolean finds) {
        findsSends = finds;
    }

    /** The next sends fail with these, one each, in order; the send is still recorded. */
    public synchronized void failNextSends(ProviderException... failures) {
        sendFailures.addAll(List.of(failures));
    }

    /** {@link #findSentMessages} finds the message Sino gave {@code clientMessageId} under {@code externalMessageId}. */
    public synchronized void sent(UUID clientMessageId, String externalMessageId) {
        found(clientMessageId, externalMessageId);
    }

    /** {@link #findSentMessages} answers these, in order, for what Sino sent with {@code clientMessageId}. */
    public synchronized void found(UUID clientMessageId, String... externalMessageIds) {
        foundSends.put(clientMessageId, List.of(externalMessageIds));
    }

    /** What a test sent or searched for before, and what it set up for sending, is forgotten. */
    public synchronized void forgetSends() {
        sent.clear();
        sendFailures.clear();
        foundSends.clear();
        searches.clear();
        held = null;
        findsSends = true;
    }

    public synchronized List<UUID> searchedSends() {
        return searches.stream().map(search -> search.command().clientMessageId()).toList();
    }

    /** What {@link #findSentMessages} was asked for, in order. */
    public synchronized List<Search> searchedAttempts() {
        return List.copyOf(searches);
    }

    @Override
    public Optional<PushRegistration> registerPush(ProviderContext context) {
        if (!capabilities.supports(ProviderCapability.PUSH_WEBHOOK)) {
            return MessageProvider.super.registerPush(context);
        }
        pushCalls.incrementAndGet();
        if (pushFailure != null) {
            throw pushFailure;
        }
        return Optional.ofNullable(push);
    }

    /** What {@link Builder#content} set for the message; empty for any other, as for a message the provider lost. */
    @Override
    public Optional<MessageContent> fetchMessageContent(ProviderContext context, String externalMessageId) {
        contentCalls.incrementAndGet();
        if (contentFailure != null) {
            throw contentFailure;
        }
        return Optional.ofNullable(contents.get(externalMessageId));
    }

    /** What {@link Builder#file} set; the provider refuses any other, as one that no longer has the file does. */
    @Override
    public AttachmentContent fetchAttachment(ProviderContext context, String externalMessageId,
            String externalAttachmentId) {
        fileCalls.incrementAndGet();
        if (fileFailure != null) {
            throw fileFailure;
        }
        AttachmentContent file = files.get(externalMessageId + "/" + externalAttachmentId);
        if (file == null) {
            throw new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "No such attachment");
        }
        return file;
    }

    /** How many times {@link #fetchAttachment} reached the fake provider, failed calls included. */
    public int fileCalls() {
        return fileCalls.get();
    }

    /** How many times {@link #fetchMessageContent} reached the fake provider, failed calls included. */
    public int contentCalls() {
        return contentCalls.get();
    }

    /** How many times {@link #fetchUpdates} was called, failed calls included. */
    public int fetchCalls() {
        return calls.get();
    }

    /** How many times {@link #registerPush} reached the fake provider, failed calls included. */
    public int pushCalls() {
        return pushCalls.get();
    }

    private static ProviderCapabilities withPush(ProviderCapabilities capabilities) {
        Set<ProviderCapability> values = EnumSet.of(ProviderCapability.PUSH_WEBHOOK);
        values.addAll(capabilities.values());
        return new ProviderCapabilities(values);
    }

    /** The commands that reached the fake provider, in order. */
    public synchronized List<SendMessageCommand> sentMessages() {
        return List.copyOf(sent);
    }

    private static NormalizedMessage normalize(RawMessage raw) {
        return new NormalizedMessage(raw.externalMessageId(), raw.externalConversationId(), null,
                MessageDirection.INBOUND, MessageType.TEXT, raw.text(), MessageStatus.SENT, false, null,
                raw.sentAt(), List.of(), Map.of(), null, null);
    }

    private static Position position(SyncCursor cursor) {
        if (cursor.isInitial()) {
            return new Position(0, cursor.since());
        }
        Matcher matcher = CURSOR.matcher(cursor.value());
        if (!matcher.matches()) {
            throw new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "Unknown cursor");
        }
        try {
            Instant since = matcher.group(2) == null ? null : Instant.parse(matcher.group(2));
            return new Position(Integer.parseInt(matcher.group(1)), since);
        } catch (DateTimeParseException e) {
            throw new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "Unknown cursor");
        }
    }

    /** The next page to return, and the moment the first sync started from, if any. */
    private record Position(int page, Instant since) {

        boolean leavesOut(RawMessage raw) {
            return since != null && raw.sentAt() != null && raw.sentAt().isBefore(since);
        }

        SyncCursor at(int nextPage) {
            return new SyncCursor(since == null ? "page-" + nextPage : "page-" + nextPage + "@" + since);
        }

    }

    /** A message as the fake provider returns it, before normalization; any field may be missing. */
    public record RawMessage(String externalMessageId, String externalConversationId, Instant sentAt,
            String text) {
    }

    public static final class Builder {

        private final ProviderType type;
        private String displayName;
        private ProviderCapabilities capabilities = ProviderCapabilities.of(ProviderCapability.READ_MESSAGES);
        private final List<List<RawMessage>> pages = new ArrayList<>();
        private OAuth2Connection oauth2;
        private Long estimate;
        private ProviderException estimateFailure;
        private final Map<Integer, ProviderException> failures = new HashMap<>();
        private PushRegistration push;
        private ProviderException pushFailure;
        private final Map<String, MessageContent> contents = new HashMap<>();
        private ProviderException contentFailure;
        private final Map<String, AttachmentContent> files = new HashMap<>();
        private ProviderException fileFailure;

        private Builder(String type) {
            this.type = ProviderType.of(type);
        }

        public Builder displayName(String displayName) {
            this.displayName = displayName;
            return this;
        }

        public Builder capabilities(ProviderCapability... capabilities) {
            this.capabilities = ProviderCapabilities.of(capabilities);
            return this;
        }

        /** Makes the fake connect over OAuth2, like Gmail. */
        public Builder oauth2(OAuth2Connection oauth2) {
            this.oauth2 = oauth2;
            return this;
        }

        /** What the fake estimates, whatever the moment; without it the fake estimates nothing. */
        public Builder estimate(long messages) {
            this.estimate = messages;
            return this;
        }

        /** Makes the estimate fail, as a provider that cannot be reached does. */
        public Builder estimateFailure(ProviderException failure) {
            this.estimateFailure = failure;
            return this;
        }

        /**
         * Makes call number {@code call} (from 1) of {@link #fetchUpdates} throw {@code failure} instead of answering;
         * the next call answers the same cursor as usual.
         */
        public Builder failOnCall(int call, ProviderException failure) {
            failures.put(call, failure);
            return this;
        }

        /** Makes the fake declare {@code PUSH_WEBHOOK} and answer every registration for push with this one. */
        public Builder push(String address, Instant expiresAt) {
            this.push = new PushRegistration(address, expiresAt);
            return this;
        }

        /** Makes the fake declare {@code PUSH_WEBHOOK} and fail every registration for push, as a refused topic does. */
        public Builder pushFailure(ProviderException failure) {
            this.pushFailure = failure;
            return this;
        }

        /** What reading the message again gives. */
        public Builder content(String externalMessageId, MessageContent content) {
            contents.put(externalMessageId, content);
            return this;
        }

        /** Makes reading any message again fail, as a provider that cannot be reached does. */
        public Builder contentFailure(ProviderException failure) {
            this.contentFailure = failure;
            return this;
        }

        /** What downloading the attachment of the message gives. */
        public Builder file(String externalMessageId, String externalAttachmentId, AttachmentContent content) {
            files.put(externalMessageId + "/" + externalAttachmentId, content);
            return this;
        }

        /** Makes every download fail, as a provider that cannot be reached does. */
        public Builder fileFailure(ProviderException failure) {
            this.fileFailure = failure;
            return this;
        }

        /** Adds the next page the provider returns. */
        public Builder page(RawMessage... messages) {
            pages.add(List.of(messages));
            return this;
        }

        public FakeMessageProvider build() {
            return new FakeMessageProvider(this);
        }

    }

    /** One question of {@link #findSentMessages}: what Sino sent, and when the send started. */
    public record Search(SendMessageCommand command, Instant startedAt) {
    }

}
