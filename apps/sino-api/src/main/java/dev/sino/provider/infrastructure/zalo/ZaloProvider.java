package dev.sino.provider.infrastructure.zalo;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderKind;
import dev.sino.provider.ProviderType;
import dev.sino.provider.infrastructure.zalo.ZaloClient.FileMeta;
import dev.sino.provider.infrastructure.zalo.ZaloClient.ImageRequest;
import dev.sino.provider.infrastructure.zalo.ZaloClient.LookupRequest;
import dev.sino.provider.infrastructure.zalo.ZaloClient.MessagePage;
import dev.sino.provider.infrastructure.zalo.ZaloClient.SendRequest;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Sent;
import dev.sino.provider.infrastructure.zalo.ZaloClient.ThreadType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.AttachmentContent;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.OutgoingFile;
import dev.sino.provider.spi.OutgoingImage;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.PushRegistration;
import dev.sino.provider.spi.QrLogin;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SendMessageResult;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * The personal Zalo connector (F09): Sino reaches Zalo through the sino-zalo service (D-273), every call through
 * {@link ZaloClient}. It connects by QR code, and is in the registry also while turned off (D-286). Reading buffered
 * messages, push registration and sending/reconciling text messages are active (ZL-08, ZL-09); so is sending a
 * picture alone (D-349, D-353).
 */
class ZaloProvider implements MessageProvider {

    static final ProviderType TYPE = ProviderType.of("zalo");
    // sino-zalo runs on this machine or in the same Docker network (D-282).
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    /** A read may wait for sino-zalo to catch up with Zalo after a restart, which it bounds at 5 s (D-278). */
    static final Duration READ_TIMEOUT = Duration.ofSeconds(10);
    /**
     * For a send and the start of a QR login: above the 10 s sino-zalo waits for Zalo to send, so a slow send comes
     * back as its 504 (D-280), and the 15 s it waits for a QR code.
     */
    static final Duration SLOW_TIMEOUT = Duration.ofSeconds(20);
    /**
     * Matches {@code PushWatches}'s 3-day renew window so the hourly watch renewal calls {@code PUT /session} and
     * restores any session after a {@code sino-zalo} restart while keeping the 30-minute fallback poll (D-277).
     */
    static final Duration PUSH_TTL = Duration.ofDays(3);
    static final int PAGE_SIZE = 100;

    private static final ProviderCapabilities CAPABILITIES = ProviderCapabilities.of(
            ProviderCapability.READ_MESSAGES,
            ProviderCapability.SEND_MESSAGES,
            ProviderCapability.SEND_IMAGES,
            ProviderCapability.SEND_FILES,
            ProviderCapability.ATTACHMENTS,
            ProviderCapability.PUSH_WEBHOOK);

    private final boolean turnedOn;
    private final ZaloClient client;
    private final ZaloQrLogin qrLogin;
    private final ZaloFileDownloads files = new ZaloFileDownloads();

    ZaloProvider(ZaloProperties properties) {
        this(new ZaloClient(properties.url(), properties.secret(), properties.enabled(),
                CONNECT_TIMEOUT, READ_TIMEOUT, SLOW_TIMEOUT), properties.enabled());
    }

    ZaloProvider(ZaloClient client, boolean turnedOn) {
        this.turnedOn = turnedOn;
        this.client = client;
        this.qrLogin = new ZaloQrLogin(client);
    }

    @Override
    public ProviderType type() {
        return TYPE;
    }

    @Override
    public String displayName() {
        return "Zalo";
    }

    @Override
    public ProviderKind kind() {
        return ProviderKind.CHAT;
    }

    @Override
    public ProviderCapabilities capabilities() {
        return CAPABILITIES;
    }

    /**
     * The file of a Zalo message, read from where Zalo serves it, which is its attachment id (zalo-send-files, ZF-08);
     * sino-zalo is not asked.
     */
    @Override
    public AttachmentContent fetchAttachment(ProviderContext context, String externalMessageId,
            String externalAttachmentId) {
        return files.download(externalAttachmentId);
    }

    @Override
    public Optional<QrLogin> qrLogin() {
        return Optional.of(qrLogin);
    }

    @Override
    public boolean turnedOn() {
        return turnedOn;
    }

    /** Who a Zalo account is comes with its QR login (D-275); sino-zalo has no call for it. */
    @Override
    public AccountProfile getAccountProfile(ProviderContext context) {
        throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                "Zalo tells who the account is only when its QR login is done");
    }

    @Override
    public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
        String after = cursor.isInitial() ? null : cursor.value();
        MessagePage page = client.messages(context, after, PAGE_SIZE);
        return ZaloMessageNormalizer.normalize(page, context.externalAccountId(), cursor.since(), cursor);
    }

    @Override
    public SendMessageResult sendMessage(ProviderContext context, SendMessageCommand command) {
        OutgoingImage image = command.image();
        if (image != null && command.textContent() != null) {
            // sino-zalo sends a text or a picture, not both: zca-js would send two messages and name two IDs (ZS-02).
            throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                    "Zalo sends a picture alone: a text beside it is not supported");
        }
        ThreadType threadType = command.conversationType() == ConversationType.GROUP
                ? ThreadType.GROUP : ThreadType.USER;
        OutgoingFile file = command.file();
        if (file != null) {
            // A picture or file from the computer goes through sino-zalo's file route (zalo-send-files, D-374).
            Sent sent = client.sendFile(context, new FileMeta(command.externalConversationId(), threadType,
                    command.clientMessageId().toString(),
                    file.kind() == OutgoingFile.Kind.PHOTO ? FileMeta.Kind.PHOTO : FileMeta.Kind.FILE, file.fileName()),
                    file.bytes());
            return new SendMessageResult(sent.msgId(), MessageStatus.SENT, sent.sentAt());
        }
        Sent sent = client.send(context, new SendRequest(
                command.externalConversationId(),
                threadType,
                command.textContent(),
                image == null ? null : ImageRequest.of(image),
                command.clientMessageId().toString()));
        return new SendMessageResult(sent.msgId(), MessageStatus.SENT, sent.sentAt());
    }

    @Override
    public List<String> findSentMessages(ProviderContext context, SendMessageCommand command, Instant startedAt) {
        try {
            return client.lookup(context, new LookupRequest(
                    command.externalConversationId(),
                    command.clientMessageId().toString(),
                    command.textContent(),
                    startedAt));
        } catch (ProviderException failure) {
            if (ZaloClient.cannotTell(failure)) {
                throw new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, failure.getMessage());
            }
            throw failure;
        }
    }

    @Override
    public Optional<PushRegistration> registerPush(ProviderContext context) {
        String ownId = context.externalAccountId() == null ? null : context.externalAccountId().strip();
        if (ownId == null || ownId.isEmpty()) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "The Zalo account has no ownId");
        }
        client.putSession(context);
        return Optional.of(new PushRegistration(ownId, Instant.now().plus(PUSH_TTL)));
    }

    @Override
    public void disconnect(ProviderContext context) {
        client.deleteSession(context);
    }

}

