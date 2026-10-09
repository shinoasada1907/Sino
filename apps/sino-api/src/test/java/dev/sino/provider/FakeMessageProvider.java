package dev.sino.provider;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.OAuth2Connection;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
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
 */
public final class FakeMessageProvider implements MessageProvider {

    private static final Pattern CURSOR = Pattern.compile("page-(\\d{1,4})(?:@(.+))?");
    private static final Instant SENT_AT = Instant.parse("2026-10-01T08:00:00Z");

    private final ProviderType type;
    private final String displayName;
    private final ProviderCapabilities capabilities;
    private final List<List<RawMessage>> pages;
    private final OAuth2Connection oauth2;
    private final List<SendMessageCommand> sent = new ArrayList<>();

    private FakeMessageProvider(Builder builder) {
        this.type = builder.type;
        this.displayName = builder.displayName;
        this.capabilities = builder.capabilities;
        this.pages = List.copyOf(builder.pages);
        this.oauth2 = builder.oauth2;
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
    public ProviderCapabilities capabilities() {
        return capabilities;
    }

    @Override
    public Optional<OAuth2Connection> oauth2() {
        return Optional.ofNullable(oauth2);
    }

    @Override
    public AccountProfile getAccountProfile(ProviderContext context) {
        return new AccountProfile("fake-account", "Fake Account", null);
    }

    @Override
    public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
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
    public synchronized SendMessageResult sendMessage(ProviderContext context, SendMessageCommand command) {
        if (!capabilities.supports(ProviderCapability.SEND_MESSAGES)) {
            return MessageProvider.super.sendMessage(context, command);
        }
        sent.add(command);
        return new SendMessageResult("sent-" + sent.size(), MessageStatus.SENT, null);
    }

    /** The commands that reached the fake provider, in order. */
    public synchronized List<SendMessageCommand> sentMessages() {
        return List.copyOf(sent);
    }

    private static NormalizedMessage normalize(RawMessage raw) {
        return new NormalizedMessage(raw.externalMessageId(), raw.externalConversationId(), null,
                MessageDirection.INBOUND, MessageType.TEXT, raw.text(), MessageStatus.SENT, false, null,
                raw.sentAt(), List.of(), Map.of());
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

        /** Adds the next page the provider returns. */
        public Builder page(RawMessage... messages) {
            pages.add(List.of(messages));
            return this;
        }

        public FakeMessageProvider build() {
            return new FakeMessageProvider(this);
        }

    }

}
