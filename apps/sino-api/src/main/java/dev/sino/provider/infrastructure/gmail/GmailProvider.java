package dev.sino.provider.infrastructure.gmail;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;

import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;
import dev.sino.provider.infrastructure.gmail.GmailApi.HistoryPage;
import dev.sino.provider.infrastructure.gmail.GmailApi.MessageList;
import dev.sino.provider.infrastructure.gmail.GmailApi.Profile;
import dev.sino.provider.infrastructure.gmail.GmailApi.Watch;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.PushRegistration;
import dev.sino.provider.spi.SkippedItem;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * The Gmail connector: who the account is, how it connects, and its mail (F04b); with a Pub/Sub topic, Gmail also
 * tells Sino of changes (D-76). Reads only; every call to Google goes through {@link GmailApi}, with a time limit.
 */
class GmailProvider implements MessageProvider {

    static final ProviderType TYPE = ProviderType.of("gmail");
    static final String REGISTRATION_ID = "google";
    static final String GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
    static final Set<String> SCOPES = Set.of("openid", "email", GMAIL_READONLY);
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(10);

    // Google issues a refresh token only for offline access, and only on a fresh consent: a reconnect must ask again.
    private static final Map<String, String> CONSENT_PARAMETERS = Map.of("access_type", "offline",
            "prompt", "consent");
    private static final ProviderCapabilities CAPABILITIES = ProviderCapabilities.of(ProviderCapability.READ_MESSAGES,
            ProviderCapability.THREADS, ProviderCapability.ATTACHMENTS);
    private static final ProviderCapabilities WITH_PUSH = ProviderCapabilities.of(ProviderCapability.READ_MESSAGES,
            ProviderCapability.THREADS, ProviderCapability.ATTACHMENTS, ProviderCapability.PUSH_WEBHOOK);
    // Not mail of the inbox: Sino leaves these out without counting them as skipped.
    private static final Set<String> HIDDEN_LABELS = Set.of("DRAFT", "SPAM", "TRASH");

    private final OAuth2Connection connection;
    private final GmailApi api;
    // Null: Gmail does not tell Sino of changes, it is only polled.
    private final String pubsubTopic;

    GmailProvider(GmailProperties properties) {
        this(properties.userInfoUri(), properties.gmailApiUri(), properties.revocationUri(), CONNECT_TIMEOUT,
                READ_TIMEOUT, properties.pubsub().topic());
    }

    GmailProvider(URI userInfoUri, URI gmailApiUri, URI revocationUri, Duration connectTimeout,
            Duration readTimeout) {
        this(userInfoUri, gmailApiUri, revocationUri, connectTimeout, readTimeout, null);
    }

    GmailProvider(URI userInfoUri, URI gmailApiUri, URI revocationUri, Duration connectTimeout,
            Duration readTimeout, String pubsubTopic) {
        this.connection = new OAuth2Connection(REGISTRATION_ID, SCOPES, Set.of(GMAIL_READONLY), CONSENT_PARAMETERS,
                revocationUri);
        this.api = new GmailApi(userInfoUri, gmailApiUri, connectTimeout, readTimeout);
        this.pubsubTopic = pubsubTopic;
    }

    @Override
    public ProviderType type() {
        return TYPE;
    }

    @Override
    public String displayName() {
        return "Gmail";
    }

    @Override
    public ProviderCapabilities capabilities() {
        return pubsubTopic == null ? CAPABILITIES : WITH_PUSH;
    }

    @Override
    public Optional<OAuth2Connection> oauth2() {
        return Optional.of(connection);
    }

    /**
     * The Google subject ({@code sub}) never changes, unlike the email, so it identifies the account. The email is
     * the address and the default name.
     */
    @Override
    public AccountProfile getAccountProfile(ProviderContext context) {
        Map<String, Object> userInfo = api.userInfo(accessTokenOf(context));
        String email = text(userInfo, "email");
        return new AccountProfile(text(userInfo, "sub"), email, null, email);
    }

    /**
     * The first sync (an initial cursor) lists the mail since {@code since}, {@value GmailApi#PAGE_SIZE} messages a
     * page, then goes on with the changes since the mailbox's history id when it started; later calls read those
     * changes. Mail from before {@code since} never comes in, not even when a change touches it. Drafts, spam and
     * trash are left out, and so is a message deleted meanwhile; a message Sino cannot read is a skipped item. Any
     * other failure fails the whole call, never half a batch.
     */
    @Override
    public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
        String accessToken = accessTokenOf(context);
        // A cursor Sino did not write is refused before Google hears of it.
        GmailCursor position = cursor.isInitial() ? null : GmailCursor.of(cursor.value());
        Profile profile = api.profile(accessToken);
        if (position == null) {
            position = GmailCursor.firstSync(historyIdOf(profile.historyId()), cursor.since());
        }
        return position.listing()
                ? firstSyncPage(accessToken, profile.emailAddress(), position)
                : changesPage(accessToken, profile, position);
    }

    private SyncBatch firstSyncPage(String accessToken, String selfEmail, GmailCursor position) {
        MessageList page = api.messages(accessToken, position.since(), position.pageToken());
        boolean more = page.nextPageToken() != null;
        GmailCursor next = more ? position.onPage(null, page.nextPageToken())
                : GmailCursor.changesSince(position.historyId(), position.since());
        return batchOf(accessToken, selfEmail, page.ids(), position.since(), next, more);
    }

    /**
     * Gmail's own count, rough either way: since {@code since}, the {@code resultSizeEstimate} of a list of one
     * message; for the whole mailbox, the {@code messagesTotal} of the profile, which also counts drafts, spam and
     * trash. Empty when Gmail leaves the number out.
     */
    @Override
    public OptionalLong estimateMessages(ProviderContext context, Instant since) {
        String accessToken = accessTokenOf(context);
        Long estimate = since == null ? api.profile(accessToken).messagesTotal() : api.estimate(accessToken, since);
        return estimate == null || estimate < 0 ? OptionalLong.empty() : OptionalLong.of(estimate);
    }

    /**
     * Asks Gmail to publish every change of the mailbox to the configured topic ({@code users.watch}, the whole
     * mailbox like the import), or renews that. Gmail's notices carry the {@code emailAddress} of the profile, so that
     * is the address, rather than the email of the sign-in. Gmail stops after about a week unless asked again; without
     * a topic, empty and Google never hears of it.
     */
    @Override
    public Optional<PushRegistration> registerPush(ProviderContext context) {
        if (pubsubTopic == null) {
            return Optional.empty();
        }
        String accessToken = accessTokenOf(context);
        String address = api.profile(accessToken).emailAddress();
        if (address == null || address.isBlank()) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "Gmail sent no address for the mailbox");
        }
        Watch watch = api.watch(accessToken, pubsubTopic);
        return Optional.of(new PushRegistration(address, expirationOf(watch.expiration())));
    }

    // A run of history pages ends at the mailbox's history id read before its first page: whatever changes while
    // it pages on is read again next time (harmless, items have external ids), never lost.
    private SyncBatch changesPage(String accessToken, Profile profile, GmailCursor position) {
        String end = position.endHistoryId() != null ? position.endHistoryId() : historyIdOf(profile.historyId());
        HistoryPage page = api.history(accessToken, position.historyId(), position.pageToken());
        boolean more = page.nextPageToken() != null;
        GmailCursor next = more ? position.onPage(end, page.nextPageToken())
                : GmailCursor.changesSince(end, position.since());
        return batchOf(accessToken, profile.emailAddress(), page.ids(), position.since(), next, more);
    }

    // Each message once, in the order Gmail named them. Mail from before since stays out: a change can touch old
    // mail, and Gmail's after: counts in whole seconds.
    private SyncBatch batchOf(String accessToken, String selfEmail, List<String> ids, Instant since,
            GmailCursor next, boolean more) {
        List<NormalizedGmailMessage> messages = new ArrayList<>();
        List<SkippedItem> skipped = new ArrayList<>();
        for (String id : new LinkedHashSet<>(ids)) {
            try {
                api.message(accessToken, id).filter(GmailProvider::isShown)
                        .map(message -> GmailMessageNormalizer.normalize(message, selfEmail))
                        .filter(normalized -> since == null || !normalized.message().sentAt().isBefore(since))
                        .ifPresent(messages::add);
            } catch (ProviderException failure) {
                if (failure.errorCode() != ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED) {
                    throw failure;
                }
                skipped.add(new SkippedItem(SkippedItem.Kind.MESSAGE, id, failure.errorCode(), failure.getMessage()));
            }
        }
        return new SyncBatch(GmailMessageNormalizer.threadsOf(messages),
                messages.stream().map(NormalizedGmailMessage::message).toList(), skipped, next.toSyncCursor(), more);
    }

    /**
     * Reads one message again ({@code messages.get}, {@code format=full}) for its HTML and addressees; empty when
     * Gmail no longer has it.
     */
    @Override
    public Optional<MessageContent> fetchMessageContent(ProviderContext context, String externalMessageId) {
        return api.message(accessTokenOf(context), externalMessageId).map(GmailMessageNormalizer::content);
    }

    // Archived mail is shown too: it still belongs to its thread.
    private static boolean isShown(GmailMessage message) {
        return message.labelIds().stream().noneMatch(HIDDEN_LABELS::contains);
    }

    private static String historyIdOf(String historyId) {
        if (historyId == null || !historyId.matches("\\d{1,20}")) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "Gmail sent no usable history id for the mailbox");
        }
        return historyId;
    }

    private static Instant expirationOf(String expiration) {
        if (expiration == null || !expiration.matches("\\d{1,18}")) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "Gmail sent no usable expiration for the watch");
        }
        return Instant.ofEpochMilli(Long.parseLong(expiration));
    }

    private static String accessTokenOf(ProviderContext context) {
        if (context.credentials() instanceof OAuth2Credentials oauth2) {
            return oauth2.accessToken();
        }
        throw new IllegalArgumentException("Gmail needs OAuth2 credentials");
    }

    private static String text(Map<String, Object> json, String name) {
        return json != null && json.get(name) instanceof String value ? value : null;
    }

}
