package dev.sino.provider.infrastructure.zalo;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLConnection;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Conversation;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.infrastructure.zalo.ZaloClient.MessagePage;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Participant;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Photo;
import dev.sino.provider.infrastructure.zalo.ZaloClient.SharedFile;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Sticker;
import dev.sino.provider.infrastructure.zalo.ZaloClient.StickerSprite;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SkippedItem;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * Turns a page of messages from {@code sino-zalo} ({@code GET /accounts/{accountId}/messages}) into Sino's normalized
 * conversations and messages (D-279, ZL-08). Non-text messages become Vietnamese placeholders with their original
 * {@code zaloType} in {@code metadata}; broken messages are recorded in {@link SkippedItem} instead of failing the
 * page; NUL characters are stripped, and text longer than {@link #MAX_TEXT_LENGTH} characters is cut without splitting
 * a UTF-16 surrogate pair.
 */
final class ZaloMessageNormalizer {

    static final int MAX_TEXT_LENGTH = 100_000;

    /** The caption of a photo lives in {@code metadata}, which holds small values; Zalo's own limit is far lower. */
    static final int MAX_CAPTION_LENGTH = 2_000;
    static final String ZALO_TYPE_KEY = "zaloType";
    static final int MAX_PICTURE_ADDRESS = 2_000;

    /**
     * What a sprite sheet may be (ZL-15): the frames of a Zalo sticker run from 2 up to a few dozen (7 and 19 seen),
     * and one run lasts a fraction of a second to a few seconds. Outside these the whole sprite is left out and the
     * sticker shows still, which also covers a duration whose unit turns out not to be milliseconds.
     */
    static final int MIN_SPRITE_FRAMES = 2;
    static final int MAX_SPRITE_FRAMES = 300;
    static final int MIN_SPRITE_DURATION_MS = 100;
    static final int MAX_SPRITE_DURATION_MS = 10_000;

    /**
     * Domains Zalo serves sticker pictures from, as zca-js's sticker answers show (not yet seen on a real run, ZL-13:
     * a picture on another host shows as the placeholder text until it is added here).
     */
    static final List<String> PICTURE_DOMAINS = List.of(
            "zadn.vn",
            "zdn.vn",
            "zaloapp.com",
            "zalo.me",
            "tenor.com",
            "tenor.co",
            "giphy.com");

    /**
     * The hosts Zalo serves the files of its messages from: dlfl.vn (seen on 2026-10-21: do37.dlfl.vn, ot145.dlfl.vn)
     * and Zalo's own; the picture hosts of other services are not among them.
     */
    static final List<String> FILE_DOMAINS = List.of("dlfl.vn", "zadn.vn", "zdn.vn", "zaloapp.com", "zalo.me");

    /** The longest file name kept, as a file sent from Sino may have (zalo-send-files, D-371). */
    private static final int MAX_FILE_NAME = 255;

    private static final Logger LOG = LoggerFactory.getLogger(ZaloMessageNormalizer.class);

    private ZaloMessageNormalizer() {
    }

    static SyncBatch normalize(MessagePage page, String ownId, Instant since, SyncCursor cursor) {
        if (page == null) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "sino-zalo returned no message page");
        }
        String selfId = clean(ownId);
        List<KeptMessage> kept = new ArrayList<>();
        List<SkippedItem> skipped = new ArrayList<>();

        for (Message raw : page.messages()) {
            try {
                NormalizedMessage normalized = normalize(raw, selfId);
                if (since == null || !normalized.sentAt().isBefore(since)) {
                    kept.add(new KeptMessage(raw, normalized));
                }
            } catch (ProviderException failure) {
                skipped.add(new SkippedItem(SkippedItem.Kind.MESSAGE, safeId(raw.msgId()), failure.errorCode(),
                        failure.getMessage()));
            }
        }

        List<NormalizedConversation> conversations = conversationsOf(page.conversations(), kept, selfId);
        List<NormalizedMessage> messages = kept.stream().map(KeptMessage::normalized).toList();
        SyncCursor nextCursor = nextCursorOf(page, cursor);
        return new SyncBatch(conversations, messages, skipped, nextCursor, page.hasMore());
    }

    static NormalizedMessage normalize(Message message, String ownId) {
        if (message == null) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, "The message is missing");
        }
        String msgId = required(message.msgId(), "msgId");
        String threadId = required(message.threadId(), "threadId");
        conversationType(message.threadType());
        Instant sentAt = parseSentAt(message.sentAt());
        String selfId = clean(ownId);
        String senderId = message.isSelf()
                ? (selfId != null ? selfId : required(message.fromId(), "fromId"))
                : required(message.fromId(), "fromId");
        Body body = bodyOf(message);
        MessageDirection direction = message.isSelf() ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;
        MessageStatus status = message.isSelf() ? MessageStatus.SENT : MessageStatus.UNKNOWN;

        return new NormalizedMessage(
                msgId,
                threadId,
                senderId,
                direction,
                body.type(),
                body.text(),
                status,
                message.isSelf(),
                null,
                sentAt,
                body.attachments(),
                body.metadata(),
                null,
                null);
    }

    private static List<NormalizedConversation> conversationsOf(List<Conversation> rawConversations,
            List<KeptMessage> kept, String selfId) {
        if (kept.isEmpty()) {
            return List.of();
        }
        Map<String, Conversation> byThreadId = new LinkedHashMap<>();
        for (Conversation conv : rawConversations) {
            String id = clean(conv.threadId());
            if (id != null && !byThreadId.containsKey(id)) {
                byThreadId.put(id, conv);
            }
        }

        Map<String, List<KeptMessage>> byConversation = new LinkedHashMap<>();
        for (KeptMessage item : kept) {
            byConversation.computeIfAbsent(item.normalized().externalConversationId(), id -> new ArrayList<>())
                    .add(item);
        }

        List<NormalizedConversation> result = new ArrayList<>(byConversation.size());
        for (Map.Entry<String, List<KeptMessage>> entry : byConversation.entrySet()) {
            String threadId = entry.getKey();
            List<KeptMessage> threadMessages = entry.getValue();
            Conversation rawConv = byThreadId.get(threadId);
            ConversationType type = rawConv != null && clean(rawConv.threadType()) != null
                    ? conversationType(rawConv.threadType())
                    : conversationType(threadMessages.getFirst().raw().threadType());
            String title = rawConv != null ? clean(rawConv.title()) : null;
            String avatarUrl = rawConv != null ? clean(rawConv.avatarUrl()) : null;
            Instant lastActivityAt = threadMessages.stream()
                    .map(item -> item.normalized().sentAt())
                    .max(Instant::compareTo)
                    .orElse(null);

            Map<String, NormalizedParticipant> participants = new LinkedHashMap<>();
            if (rawConv != null) {
                for (Participant p : rawConv.participants()) {
                    String pid = clean(p.id());
                    if (pid != null) {
                        mergeParticipant(participants, pid, clean(p.name()), clean(p.avatarUrl()), pid.equals(selfId));
                    }
                }
            }
            for (KeptMessage item : threadMessages) {
                String senderId = item.normalized().senderExternalParticipantId();
                String senderName = clean(item.raw().fromName());
                boolean isSelf = item.raw().isSelf() || senderId.equals(selfId);
                mergeParticipant(participants, senderId, senderName, null, isSelf);
                if (title == null && type == ConversationType.DIRECT && !isSelf && senderName != null) {
                    title = senderName;
                }
            }
            if (selfId != null) {
                mergeParticipant(participants, selfId, null, null, true);
            }
            result.add(new NormalizedConversation(
                    threadId,
                    type,
                    title,
                    avatarUrl,
                    List.copyOf(participants.values()),
                    lastActivityAt));
        }
        return result;
    }

    // The name and the picture are the first one that is not null; self is true once any of them says so.
    private static void mergeParticipant(Map<String, NormalizedParticipant> participants, String id,
            String displayName, String avatarUrl, boolean self) {
        NormalizedParticipant existing = participants.get(id);
        if (existing == null) {
            participants.put(id, new NormalizedParticipant(id, displayName, avatarUrl, self));
            return;
        }
        String mergedName = existing.displayName() != null ? existing.displayName() : displayName;
        String mergedAvatar = existing.avatarUrl() != null ? existing.avatarUrl() : avatarUrl;
        boolean mergedSelf = existing.self() || self;
        participants.put(id, new NormalizedParticipant(id, mergedName, mergedAvatar, mergedSelf));
    }

    private static SyncCursor nextCursorOf(MessagePage page, SyncCursor current) {
        String next = clean(page.nextCursor());
        if (page.hasMore()) {
            if (next == null || next.equals(current.value())) {
                throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                        "sino-zalo said there are more messages without advancing the cursor");
            }
            return new SyncCursor(next);
        }
        if (next != null) {
            return new SyncCursor(next);
        }
        return current.isInitial() ? SyncCursor.initial() : new SyncCursor(current.value());
    }

    private static Body bodyOf(Message message) {
        String zaloType = required(message.zaloType(), ZALO_TYPE_KEY);
        return switch (zaloType) {
            case "webchat" -> {
                if (message.text() == null) {
                    throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                            "The webchat message has no text");
                }
                yield new Body(MessageType.TEXT, cut(withoutNul(message.text()), MAX_TEXT_LENGTH), Map.of());
            }
            case "chat.photo" -> photoBody(message.photo());
            case "chat.sticker" -> stickerBody("chat.sticker", "[Sticker]", message.sticker());
            case "chat.gif" -> stickerBody("chat.gif", "[GIF]", message.sticker());
            case "share.file" -> fileBody(message.file());
            case "chat.voice" -> new Body(MessageType.AUDIO, "[Tin nhắn thoại]", Map.of(ZALO_TYPE_KEY, "chat.voice"));
            default -> new Body(MessageType.UNKNOWN, "[Tin Zalo chưa hỗ trợ]", Map.of(ZALO_TYPE_KEY, zaloType));
        };
    }

    /**
     * A file is a {@code FILE} named by its name, with one attachment: its name, a type guessed from the name, its size
     * when Zalo said it, and where Zalo serves it, which is also its id, so {@code fetchAttachment} can read it
     * (zalo-send-files, ZF-08). Only an address on Zalo's own hosts is kept ({@link #fileAddress}); without one, or
     * without a name, the message stays the placeholder {@code [Tệp]}.
     */
    private static Body fileBody(SharedFile file) {
        Map<String, String> metadata = Map.of(ZALO_TYPE_KEY, "share.file");
        String name = file == null ? null : clean(file.name());
        String url = file == null ? null : fileAddress(file.url());
        if (name == null || url == null) {
            if (file != null) {
                warnRefused("file", file.url());
            }
            return new Body(MessageType.FILE, "[Tệp]", metadata);
        }
        name = cut(name, MAX_FILE_NAME);
        Long size = file.sizeBytes() != null && file.sizeBytes() >= 0 ? file.sizeBytes() : null;
        String type = URLConnection.getFileNameMap().getContentTypeFor(name);
        return new Body(MessageType.FILE, name, metadata, List.of(new NormalizedAttachment(url, name,
                type != null ? type : "application/octet-stream", size, url, null, null)));
    }

    /** Where Zalo serves a file: an https address on one of Zalo's own hosts, or null (zalo-send-files, ZF-08). */
    static String fileAddress(String raw) {
        return addressOn(raw, FILE_DOMAINS);
    }

    /**
     * A photo is an {@code IMAGE} whose text stays {@code [Ảnh]}; the picture rides in {@code metadata} when its address
     * passes {@link #pictureAddress}. A thumbnail Sino refuses is left out; one Sino accepts stands in for a picture it
     * refuses. With no safe address at all the message is the placeholder alone, and the host Zalo named is warned
     * about, so a CDN missing from {@link #PICTURE_DOMAINS} shows in the log instead of as pictures that never come.
     */
    private static Body photoBody(Photo photo) {
        if (photo != null && photo.drawnAsSticker()) {
            return photoStickerBody(photo);
        }
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put(ZALO_TYPE_KEY, "chat.photo");
        if (photo != null) {
            String url = pictureAddress(photo.url());
            String thumb = pictureAddress(photo.thumbUrl());
            if (url == null) {
                url = thumb;
                thumb = null;
            }
            if (url != null) {
                metadata.put(NormalizedMessage.IMAGE_URL, url);
                if (thumb != null && !thumb.equals(url)) {
                    metadata.put(NormalizedMessage.IMAGE_THUMB_URL, thumb);
                }
                String caption = clean(photo.caption());
                putIfPresent(metadata, NormalizedMessage.IMAGE_CAPTION,
                        caption == null ? null : cut(caption, MAX_CAPTION_LENGTH));
            } else {
                warnRefused("photo", clean(photo.url()) != null ? photo.url() : photo.thumbUrl());
            }
        }
        return new Body(MessageType.IMAGE, "[Ảnh]", Map.copyOf(metadata));
    }

    /**
     * A photo Zalo draws as a sticker (ZL-19) is an {@code IMAGE} like the stickers Sino sends (D-352), with the text
     * {@code [Sticker]} and its picture as {@code stickerUrl}, so the web draws it without the photo frame. Its
     * thumbnail stands in for a picture Sino refuses; a caption is not kept (a sticker has none). {@code zaloType}
     * stays {@code chat.photo}, what Zalo sent.
     */
    private static Body photoStickerBody(Photo photo) {
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put(ZALO_TYPE_KEY, "chat.photo");
        String picture = pictureAddress(photo.url());
        if (picture == null) {
            picture = pictureAddress(photo.thumbUrl());
        }
        if (picture == null) {
            warnRefused("sticker", clean(photo.url()) != null ? photo.url() : photo.thumbUrl());
        }
        putIfPresent(metadata, NormalizedMessage.STICKER_URL, picture);
        return new Body(MessageType.IMAGE, "[Sticker]", Map.copyOf(metadata));
    }

    /**
     * Says what is known of an address of a picture Sino refused ({@code what}: a photo, a sticker, a gif, a sticker
     * sprite), and nothing of its path (it can open the picture): the host and the scheme when the address can be
     * read, its length, and whether it is plain printable ASCII. Enough to tell a Zalo CDN missing from
     * {@link #PICTURE_DOMAINS} from an address refused for how it is written. Nothing is said for no address at all.
     */
    private static void warnRefused(String what, String raw) {
        String address = clean(raw);
        if (address != null) {
            LOG.warn("Zalo gave a {} whose address Sino does not accept ({})", what, describe(address));
        }
    }

    private static String describe(String address) {
        String host = "unreadable";
        String scheme = "unreadable";
        try {
            URI uri = new URI(address);
            if (uri.getHost() != null && uri.getHost().matches("[A-Za-z0-9.-]{1,100}")) {
                host = uri.getHost();
            }
            if (uri.getScheme() != null && uri.getScheme().matches("[A-Za-z][A-Za-z0-9+.-]{0,20}")) {
                scheme = uri.getScheme().toLowerCase(Locale.ROOT);
            }
        } catch (URISyntaxException invalid) {
            // Both stay "unreadable".
        }
        boolean plain = address.chars().allMatch(c -> c > 0x20 && c < 0x7f);
        return "host: " + host + ", scheme: " + scheme + ", length: " + address.length() + ", plain: " + plain;
    }

    private static Body stickerBody(String zaloType, String placeholderText, Sticker sticker) {
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put(ZALO_TYPE_KEY, zaloType);
        if (sticker != null) {
            putIfPresent(metadata, "stickerId", clean(sticker.id()));
            putIfPresent(metadata, "stickerCatId", clean(sticker.catId()));
            String picture = pictureAddress(sticker.url());
            if (picture == null) {
                warnRefused("chat.gif".equals(zaloType) ? "gif" : "sticker", sticker.url());
            }
            putIfPresent(metadata, NormalizedMessage.STICKER_URL, picture);
            // Only a Zalo sticker moves by a sprite sheet; a gif is its own moving picture.
            if ("chat.sticker".equals(zaloType)) {
                putSprite(metadata, sticker.sprite());
            }
        }
        return new Body(MessageType.UNKNOWN, placeholderText, Map.copyOf(metadata));
    }

    /** The sprite sheet with its frames and duration, or nothing at all when any of the three cannot be trusted. */
    private static void putSprite(Map<String, String> metadata, StickerSprite sprite) {
        if (sprite == null) {
            return;
        }
        String address = pictureAddress(sprite.url());
        if (address == null) {
            warnRefused("sticker sprite", sprite.url());
        }
        Integer frames = sprite.frames();
        Integer durationMs = sprite.durationMs();
        if (address == null || frames == null || durationMs == null
                || frames < MIN_SPRITE_FRAMES || frames > MAX_SPRITE_FRAMES
                || durationMs < MIN_SPRITE_DURATION_MS || durationMs > MAX_SPRITE_DURATION_MS) {
            return;
        }
        metadata.put(NormalizedMessage.STICKER_SPRITE_URL, address);
        metadata.put(NormalizedMessage.STICKER_FRAMES, String.valueOf(frames));
        metadata.put(NormalizedMessage.STICKER_DURATION_MS, String.valueOf(durationMs));
    }

    private static void putIfPresent(Map<String, String> metadata, String key, String value) {
        if (value != null) {
            metadata.put(key, value);
        }
    }

    /**
     * The address of a sticker's picture when the web may put it in an image: {@code https}, no user info, no
     * characters a browser would escape or a header would not carry, a host that is a Zalo domain or a subdomain of
     * one (never merely ending in its name), and not longer than {@link #MAX_PICTURE_ADDRESS}. Otherwise null, and the
     * sticker stays the placeholder text: a wrong address is worse than none, since sino-zalo takes it from Zalo's
     * answer and the browser would fetch it on every opening of the chat.
     */
    static String pictureAddress(String raw) {
        return addressOn(raw, PICTURE_DOMAINS);
    }

    // An https address without user info, written in printable ASCII, on one of the domains or under one.
    private static String addressOn(String raw, List<String> domains) {
        String address = clean(raw);
        if (address == null || address.length() > MAX_PICTURE_ADDRESS || !address.chars().allMatch(c -> c > 0x20 && c < 0x7f)) {
            return null;
        }
        URI uri;
        try {
            uri = new URI(address);
        } catch (URISyntaxException invalid) {
            return null;
        }
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getUserInfo() != null) {
            return null;
        }
        String lower = host.toLowerCase(Locale.ROOT);
        boolean zalo = domains.stream().anyMatch(domain -> lower.equals(domain) || lower.endsWith("." + domain));
        return zalo ? address : null;
    }

    private static ConversationType conversationType(String rawType) {
        String cleaned = clean(rawType);
        if ("USER".equals(cleaned)) {
            return ConversationType.DIRECT;
        }
        if ("GROUP".equals(cleaned)) {
            return ConversationType.GROUP;
        }
        throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                "The message has no usable threadType");
    }

    private static Instant parseSentAt(String rawSentAt) {
        String cleaned = clean(rawSentAt);
        if (cleaned == null) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, "The message has no sentAt");
        }
        try {
            return Instant.parse(cleaned);
        } catch (DateTimeParseException invalid) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "The message has no usable sentAt");
        }
    }

    private static String required(String value, String field) {
        String cleaned = clean(value);
        if (cleaned == null) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "The message has no " + field);
        }
        return cleaned;
    }

    private static String safeId(String rawId) {
        String cleaned = clean(rawId);
        return cleaned != null ? cleaned : "unknown";
    }

    private static String clean(String value) {
        if (value == null) {
            return null;
        }
        String stripped = withoutNul(value).strip();
        return stripped.isEmpty() ? null : stripped;
    }

    private static String withoutNul(String value) {
        return value.indexOf('\0') < 0 ? value : value.replace("\0", "");
    }

    private static String cut(String text, int max) {
        if (text.length() <= max) {
            return text;
        }
        int end = Character.isHighSurrogate(text.charAt(max - 1)) ? max - 1 : max;
        return text.substring(0, end);
    }

    private record KeptMessage(Message raw, NormalizedMessage normalized) {
    }

    private record Body(MessageType type, String text, Map<String, String> metadata,
            List<NormalizedAttachment> attachments) {

        Body(MessageType type, String text, Map<String, String> metadata) {
            this(type, text, metadata, List.of());
        }

    }

}
