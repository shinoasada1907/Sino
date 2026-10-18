package dev.sino.conversation.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.conversation.application.InboxMessage.File;
import dev.sino.conversation.application.InboxMessage.Sender;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.NormalizedMessage;

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
                   m.metadata ->> :subject AS subject,
                   m.metadata ->> :stickerUrl AS sticker_url,
                   p.external_participant_id AS sender, p.display_name AS sender_name, p.is_self
            FROM message m LEFT JOIN conversation_participant p ON p.id = m.sender_participant_id
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

    private final JdbcClient jdbc;
    private final InboxService inbox;

    MessageHistory(JdbcClient jdbc, InboxService inbox) {
        this.jdbc = jdbc;
        this.inbox = inbox;
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
        JdbcClient.StatementSpec query = jdbc.sql(EVERY_COPY + COLUMNS + "WHERE m.id IN (SELECT id FROM shown"
                + (cursor == null ? "" : " WHERE (sent_at, id) < (:before, :beforeId)")
                + " ORDER BY sent_at DESC, id DESC LIMIT :rows) ORDER BY m.sent_at DESC, m.id DESC")
                .param("subject", NormalizedMessage.SUBJECT).param("stickerUrl", NormalizedMessage.STICKER_URL)
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
        return jdbc.sql(SELECT + "AND m.id = :message").param("subject", NormalizedMessage.SUBJECT)
                .param("stickerUrl", NormalizedMessage.STICKER_URL)
                .param("conversation", conversationId).param("message", messageId)
                .query((row, n) -> messageOf(row)).optional()
                .map(message -> withFiles(List.of(message)).getFirst());
    }

    private static InboxMessage messageOf(ResultSet row) throws SQLException {
        StoredRecipients recipients = StoredRecipients.parse(row.getString("recipients"));
        String sender = row.getString("sender");
        return new InboxMessage(row.getObject("id", UUID.class),
                MessageDirection.valueOf(row.getString("direction")),
                MessageStatus.valueOf(row.getString("status")),
                row.getObject("sent_at", OffsetDateTime.class).toInstant(),
                sender == null ? null : new Sender(row.getString("sender_name"), sender, row.getBoolean("is_self")),
                recipients == null ? null : recipients.to(), recipients == null ? null : recipients.cc(),
                row.getString("subject"), row.getString("text_content"),
                BodyFormat.valueOf(row.getString("body_format")), row.getBoolean("is_read"), List.of(),
                row.getObject("client_message_id", UUID.class), row.getString("sticker_url"));
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
        return messages.stream().map(m -> new InboxMessage(m.id(), m.direction(), m.status(), m.sentAt(), m.sender(),
                m.to(), m.cc(), m.subject(), m.text(), m.bodyFormat(), m.read(),
                List.copyOf(files.getOrDefault(m.id(), List.of())), m.clientMessageId(), m.sticker())).toList();
    }

}
