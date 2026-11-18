package dev.sino.conversation.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.conversation.application.InboxMessage.File;
import dev.sino.conversation.application.InboxMessage.Image;
import dev.sino.conversation.application.InboxMessage.Quote;
import dev.sino.conversation.application.InboxMessage.Reaction;
import dev.sino.conversation.application.InboxMessage.Sender;
import dev.sino.conversation.application.InboxMessage.StickerSprite;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.NormalizedMessage;
import tools.jackson.databind.json.JsonMapper;

/**
 * The messages of one conversation of the inbox (F06 design, D-123), read straight with SQL: who sent each, to whom,
 * its text and files, never its HTML ({@link MessageBodies} gives that, one message at a time).
 */
@Service
@Transactional(readOnly = true)
public class MessageHistory {

    private static final String COLUMNS = """
            SELECT m.id, m.direction, m.status, m.sent_at, m.text_content, m.body_format, m.is_read, m.recipients,
                   m.client_message_id,
                   m.external_message_id, m.reply_to_external_message_id, m.metadata::text AS metadata_json,
                   a.provider AS provider, orig.id AS quote_id, orig.display_name AS quote_name, orig.is_self AS quote_self,
                   m.metadata ->> :subject AS subject,
                   m.metadata ->> :stickerUrl AS sticker_url,
                   m.metadata ->> :stickerSpriteUrl AS sticker_sprite_url,
                   m.metadata ->> :stickerFrames AS sticker_frames,
                   m.metadata ->> :stickerDurationMs AS sticker_duration_ms,
                   m.metadata ->> :imageUrl AS image_url,
                   m.metadata ->> :imageThumbUrl AS image_thumb_url,
                   m.metadata ->> :imageCaption AS image_caption,
                   m.metadata ->> :libraryStickerId AS library_sticker_id,
                   p.external_participant_id AS sender, p.display_name AS sender_name, p.avatar_url AS sender_avatar_url, p.is_self
            FROM message m LEFT JOIN conversation_participant p ON p.id = m.sender_participant_id
            JOIN conversation c ON c.id = m.conversation_id JOIN connected_account a ON a.id = c.account_id
            LEFT JOIN LATERAL (
                SELECT q.id, qp.display_name, qp.is_self FROM message q
                LEFT JOIN conversation_participant qp ON qp.id = q.sender_participant_id
                WHERE q.conversation_id = m.conversation_id AND q.external_message_id = m.reply_to_external_message_id
                LIMIT 1) orig ON true
            """;

    private static final String SELECT = COLUMNS + "WHERE m.conversation_id = :conversation\n";

    // The messages of every copy of a thread (F05b, D-184), each Message-ID once: from the copy it went from, which
    // keeps what Sino knows of a message it sent, else the oldest copy. Not the primary one: it changes when another
    // copy gets a new message, and the copy picked must not, or a page would leave out or repeat what another copy
    // dates on the other side of its cursor. A message without one is always there, and so is one whose Message-ID
    // header was empty: nothing says two of those are one. Only IDs and times are sorted for that; the page is cut from
    // what is left, so it never brings back the other copy of a message, which its own mailbox may date differently,
    // and only the messages of the page are read whole. The key is written out, not a parameter: DISTINCT ON and
    // ORDER BY must be the same expression, and two parameters are two expressions to PostgreSQL.
    private static final String EVERY_COPY = """
            WITH shown AS (
                SELECT DISTINCT ON (COALESCE('rfc:' || NULLIF(m.metadata ->> '%1$s', ''), 'id:' || m.id))
                       m.id, m.sent_at
                FROM unnest(ARRAY[:copies]::uuid[]) WITH ORDINALITY AS copy(id, rank)
                JOIN message m ON m.conversation_id = copy.id
                ORDER BY COALESCE('rfc:' || NULLIF(m.metadata ->> '%1$s', ''), 'id:' || m.id),
                         m.direction = 'OUTBOUND' DESC, copy.rank, m.id
            )
            """.formatted(NormalizedMessage.RFC_MESSAGE_ID);

    static final String SELF_NAME = "Bạn";

    // What a quote of a message that is no text shows when it has no words of its own.
    private static final Map<String, String> QUOTE_KINDS = Map.of("photo", "Ảnh", "sticker", "Sticker", "gif", "GIF",
            "voice", "Tin nhắn thoại", "video", "Video", "file", "Tệp", "link", "Liên kết", "location", "Vị trí",
            "other", "Tin nhắn");
    private static final String UNKNOWN_EMOJI = "D83DDCAC";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JdbcClient jdbc;
    private final InboxService inbox;
    private final ProviderRegistry providers;

    MessageHistory(JdbcClient jdbc, InboxService inbox, ProviderRegistry providers) {
        this.jdbc = jdbc;
        this.inbox = inbox;
        this.providers = providers;
    }

    /**
     * Newest first, then by ID, {@code limit} at most, after {@code cursor} when given: the messages of every copy of
     * the thread in the inbox, each once (F05b, D-184).
     *
     * @throws dev.sino.common.error.SinoException with {@code CONVERSATION_NOT_FOUND} when not in the inbox
     */
    public MessagePage page(UUID ownerId, UUID conversationId, MessageCursor cursor, int limit) {
        List<UUID> copies = inbox.requireInInbox(ownerId, conversationId).conversationIds();
        // Keyset paging as for the inbox; one more row than asked tells whether there is a next page.
        JdbcClient.StatementSpec query = withMetadataKeys(jdbc.sql(EVERY_COPY + COLUMNS
                + "WHERE m.id IN (SELECT id FROM shown"
                + (cursor == null ? "" : " WHERE (sent_at, id) < (:before, :beforeId)")
                + " ORDER BY sent_at DESC, id DESC LIMIT :rows) ORDER BY m.sent_at DESC, m.id DESC"))
                .param("copies", copies).param("rows", limit + 1);
        if (cursor != null) {
            query = query.param("before", cursor.sentAt().atOffset(ZoneOffset.UTC)).param("beforeId", cursor.id());
        }
        List<InboxMessage> rows = query.query((row, n) -> messageOf(row)).list();
        List<InboxMessage> items = withFiles(rows.size() <= limit ? rows : rows.subList(0, limit));
        if (rows.size() <= limit) {
            return new MessagePage(items, null);
        }
        InboxMessage last = items.getLast();
        return new MessagePage(items, new MessageCursor(last.sentAt(), last.id()));
    }

    /** One message of one copy of a conversation the caller already found in the inbox, as {@link #page} lists it. */
    Optional<InboxMessage> message(UUID conversationId, UUID messageId) {
        return withMetadataKeys(jdbc.sql(SELECT + "AND m.id = :message"))
                .param("conversation", conversationId).param("message", messageId)
                .query((row, n) -> messageOf(row)).optional()
                .map(message -> withFiles(List.of(message)).getFirst());
    }

    /** The names of the {@code metadata} values {@link #COLUMNS} reads, which the connectors write (NormalizedMessage). */
    private static JdbcClient.StatementSpec withMetadataKeys(JdbcClient.StatementSpec query) {
        return query.param("subject", NormalizedMessage.SUBJECT).param("stickerUrl", NormalizedMessage.STICKER_URL)
                .param("stickerSpriteUrl", NormalizedMessage.STICKER_SPRITE_URL)
                .param("stickerFrames", NormalizedMessage.STICKER_FRAMES)
                .param("stickerDurationMs", NormalizedMessage.STICKER_DURATION_MS)
                .param("imageUrl", NormalizedMessage.IMAGE_URL)
                .param("imageThumbUrl", NormalizedMessage.IMAGE_THUMB_URL)
                .param("imageCaption", NormalizedMessage.IMAGE_CAPTION)
                .param("libraryStickerId", NormalizedMessage.LIBRARY_STICKER_ID);
    }

    private InboxMessage messageOf(ResultSet row) throws SQLException {
        StoredRecipients recipients = StoredRecipients.parse(row.getString("recipients"));
        String sender = row.getString("sender");
        Map<String, String> metadata = metadataOf(row.getString("metadata_json"));
        MessageProvider connector = providers.find(ProviderType.of(row.getString("provider"))).orElse(null);
        boolean sent = !row.getString("external_message_id").startsWith(ReplyService.UNSENT);
        boolean canReact = sent && connector != null && connector.capabilities().supports(ProviderCapability.REACTIONS)
                && connector.canReact(metadata);
        boolean canQuote = sent && connector != null && connector.canQuote(metadata);
        Quote quote = quoteOf(row, metadata);
        return new InboxMessage(row.getObject("id", UUID.class),
                MessageDirection.valueOf(row.getString("direction")),
                MessageStatus.valueOf(row.getString("status")),
                row.getObject("sent_at", OffsetDateTime.class).toInstant(),
                sender == null ? null : new Sender(row.getString("sender_name"), sender, row.getString("sender_avatar_url"), row.getBoolean("is_self")),
                recipients == null ? null : recipients.to(), recipients == null ? null : recipients.cc(),
                row.getString("subject"), row.getString("text_content"),
                BodyFormat.valueOf(row.getString("body_format")), row.getBoolean("is_read"), List.of(),
                row.getObject("client_message_id", UUID.class), row.getString("sticker_url"),
                spriteOf(row.getString("sticker_sprite_url"), row.getString("sticker_frames"),
                        row.getString("sticker_duration_ms")),
                imageOf(row.getString("image_url"), row.getString("image_thumb_url"),
                        row.getString("image_caption")),
                libraryStickerOf(row.getString("library_sticker_id")), List.of(), canReact, quote, canQuote);
    }

    /**
     * The message this one answers, from what was stored when it came or went (zalo-quote-reply, D-504): the name and
     * words of the quote, or those of the original when Sino holds it, the user as "Bạn". Null for a message that
     * quotes nothing, such as mail, whose reply header is no quote.
     */
    private static Quote quoteOf(ResultSet row, Map<String, String> metadata) throws SQLException {
        String kind = metadata.get(NormalizedMessage.QUOTE_KIND);
        if (row.getString("reply_to_external_message_id") == null || kind == null) {
            return null;
        }
        String name = row.getBoolean("quote_self") ? SELF_NAME : firstText(row.getString("quote_name"),
                metadata.get(NormalizedMessage.QUOTE_SENDER));
        String text = firstText(metadata.get(NormalizedMessage.QUOTE_TEXT), QUOTE_KINDS.get(kind));
        return new Quote(row.getObject("quote_id", UUID.class), name == null ? "" : name, text == null ? "" : text);
    }

    private static String firstText(String first, String second) {
        return first != null && !first.isBlank() ? first : second;
    }

    static Map<String, String> metadataOf(String json) {
        if (json == null) {
            return Map.of();
        }
        Map<String, String> metadata = new HashMap<>();
        JSON.readTree(json).properties().forEach(entry -> {
            if (entry.getValue().isString()) {
                metadata.put(entry.getKey(), entry.getValue().stringValue());
            }
        });
        return metadata;
    }

    /** The sticker of the library a message Sino sent carries (ZS-05): none when the key is missing or is no ID. */
    private static UUID libraryStickerOf(String id) {
        if (id == null) {
            return null;
        }
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException notAnId) {
            return null;
        }
    }

    /** The picture of a photo as the connector stored it (ZL-16): none without its address, whatever else is there. */
    private static Image imageOf(String url, String thumbUrl, String caption) {
        return url == null ? null : new Image(url, thumbUrl, caption);
    }

    /**
     * The sprite sheet of a sticker as the connector stored it (ZL-15). The metadata is text, so it is read back with
     * care: all three values must be there and the numbers whole and above zero, else the sticker lists no sprite and
     * shows still.
     */
    private static StickerSprite spriteOf(String url, String frames, String durationMs) {
        if (url == null || frames == null || durationMs == null) {
            return null;
        }
        try {
            int frameCount = Integer.parseInt(frames);
            int duration = Integer.parseInt(durationMs);
            return frameCount > 1 && duration > 0 ? new StickerSprite(url, frameCount, duration) : null;
        } catch (NumberFormatException unreadable) {
            return null;
        }
    }

    private List<InboxMessage> withFiles(List<InboxMessage> messages) {
        if (messages.isEmpty()) {
            return messages;
        }
        Map<UUID, List<File>> files = new HashMap<>();
        jdbc.sql("""
                SELECT message_id, id, file_name, mime_type, size_bytes FROM attachment
                WHERE message_id IN (:messages) AND content_id IS NULL ORDER BY id
                """).param("messages", messages.stream().map(InboxMessage::id).toList())
                .query(row -> {
                    files.computeIfAbsent(row.getObject("message_id", UUID.class), id -> new ArrayList<>())
                            .add(new File(row.getObject("id", UUID.class), row.getString("file_name"),
                                    row.getString("mime_type"), row.getObject("size_bytes", Long.class)));
                });
        Map<UUID, List<Reaction>> reactions = reactionsOf(messages.stream().map(InboxMessage::id).toList());
        return messages.stream().map(m -> new InboxMessage(m.id(), m.direction(), m.status(), m.sentAt(), m.sender(),
                m.to(), m.cc(), m.subject(), m.text(), m.bodyFormat(), m.read(),
                List.copyOf(files.getOrDefault(m.id(), List.of())), m.clientMessageId(), m.sticker(),
                m.stickerSprite(), m.image(), m.libraryStickerId(), reactions.getOrDefault(m.id(), List.of()),
                m.canReact(), m.quote(), m.canQuote())).toList();
    }

    /**
     * The emoji on each of the messages, most people first and in the order they were first dropped for a tie (zalo-reactions,
     * D-387). A reactor who took theirs off is not counted; the user is named "Bạn". A code the connector does not list
     * shows as a speech bubble.
     */
    Map<UUID, List<Reaction>> reactionsOf(List<UUID> messageIds) {
        if (messageIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Map<String, List<StoredReaction>>> grouped = new HashMap<>();
        jdbc.sql("""
                SELECT r.message_id, r.code, r.reactor_name, r.is_self, a.provider
                FROM message_reaction r JOIN message m ON m.id = r.message_id
                JOIN conversation c ON c.id = m.conversation_id JOIN connected_account a ON a.id = c.account_id
                WHERE r.message_id IN (:messages) AND r.code IS NOT NULL
                ORDER BY r.reacted_at, r.reactor_external_id
                """).param("messages", messageIds)
                .query(row -> {
                    grouped.computeIfAbsent(row.getObject("message_id", UUID.class), id -> new LinkedHashMap<>())
                            .computeIfAbsent(row.getString("code"), code -> new ArrayList<>())
                            .add(new StoredReaction(row.getString("reactor_name"), row.getBoolean("is_self"),
                                    row.getString("provider")));
                });
        Map<String, Map<String, String>> emojis = new HashMap<>();
        Map<UUID, List<Reaction>> result = new HashMap<>();
        grouped.forEach((message, byCode) -> {
            List<Reaction> reactions = new ArrayList<>();
            byCode.forEach((code, people) -> {
                String provider = people.getFirst().provider();
                String emoji = emojis.computeIfAbsent(provider, this::emojisOf).getOrDefault(code, UNKNOWN_EMOJI);
                reactions.add(new Reaction(code, emoji, people.size(), people.stream().anyMatch(StoredReaction::self),
                        people.stream().map(StoredReaction::label).toList()));
            });
            // Stable: a tie keeps the order the codes were first dropped in.
            reactions.sort((a, b) -> Integer.compare(b.count(), a.count()));
            result.put(message, List.copyOf(reactions));
        });
        return result;
    }

    private Map<String, String> emojisOf(String provider) {
        Map<String, String> emojis = new HashMap<>();
        providers.find(ProviderType.of(provider))
                .ifPresent(connector -> connector.reactionSet().forEach(kind -> emojis.put(kind.code(), kind.emoji())));
        return emojis;
    }

    private record StoredReaction(String name, boolean self, String provider) {

        String label() {
            return self ? SELF_NAME : name == null || name.isBlank() ? "Ai đó" : name;
        }

    }

}

