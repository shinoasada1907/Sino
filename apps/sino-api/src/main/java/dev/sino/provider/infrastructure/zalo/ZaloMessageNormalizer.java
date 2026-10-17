package dev.sino.provider.infrastructure.zalo;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Conversation;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.infrastructure.zalo.ZaloClient.MessagePage;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Participant;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
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
    static final String ZALO_TYPE_KEY = "zaloType";

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
                List.of(),
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
                        mergeParticipant(participants, pid, clean(p.name()), pid.equals(selfId));
                    }
                }
            }
            for (KeptMessage item : threadMessages) {
                String senderId = item.normalized().senderExternalParticipantId();
                String senderName = clean(item.raw().fromName());
                boolean isSelf = item.raw().isSelf() || senderId.equals(selfId);
                mergeParticipant(participants, senderId, senderName, isSelf);
                if (title == null && type == ConversationType.DIRECT && !isSelf && senderName != null) {
                    title = senderName;
                }
            }
            if (selfId != null) {
                mergeParticipant(participants, selfId, null, true);
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

    private static void mergeParticipant(Map<String, NormalizedParticipant> participants, String id,
            String displayName, boolean self) {
        NormalizedParticipant existing = participants.get(id);
        if (existing == null) {
            participants.put(id, new NormalizedParticipant(id, displayName, null, self));
            return;
        }
        String mergedName = existing.displayName() != null ? existing.displayName() : displayName;
        boolean mergedSelf = existing.self() || self;
        participants.put(id, new NormalizedParticipant(id, mergedName, null, mergedSelf));
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
                yield new Body(MessageType.TEXT, cut(withoutNul(message.text())), Map.of());
            }
            case "chat.photo" -> new Body(MessageType.IMAGE, "[Ảnh]", Map.of(ZALO_TYPE_KEY, "chat.photo"));
            case "chat.sticker" -> new Body(MessageType.UNKNOWN, "[Sticker]", Map.of(ZALO_TYPE_KEY, "chat.sticker"));
            case "share.file" -> new Body(MessageType.FILE, "[Tệp]", Map.of(ZALO_TYPE_KEY, "share.file"));
            case "chat.voice" -> new Body(MessageType.AUDIO, "[Tin nhắn thoại]", Map.of(ZALO_TYPE_KEY, "chat.voice"));
            default -> new Body(MessageType.UNKNOWN, "[Tin Zalo chưa hỗ trợ]", Map.of(ZALO_TYPE_KEY, zaloType));
        };
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

    private static String cut(String text) {
        if (text.length() <= MAX_TEXT_LENGTH) {
            return text;
        }
        int end = Character.isHighSurrogate(text.charAt(MAX_TEXT_LENGTH - 1))
                ? MAX_TEXT_LENGTH - 1
                : MAX_TEXT_LENGTH;
        return text.substring(0, end);
    }

    private record KeptMessage(Message raw, NormalizedMessage normalized) {
    }

    private record Body(MessageType type, String text, Map<String, String> metadata) {
    }

}
