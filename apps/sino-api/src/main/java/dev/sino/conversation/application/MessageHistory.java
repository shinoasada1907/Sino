package dev.sino.conversation.application;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.conversation.application.InboxMessage.Address;
import dev.sino.conversation.application.InboxMessage.File;
import dev.sino.conversation.application.InboxMessage.Sender;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.NormalizedMessage;
import tools.jackson.databind.json.JsonMapper;

/**
 * The messages of one conversation of the inbox (F06 design, D-123), read straight with SQL: who sent each, to whom,
 * its text and files, never its HTML.
 */
@Service
@Transactional(readOnly = true)
public class MessageHistory {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JdbcClient jdbc;
    private final InboxService inbox;

    MessageHistory(JdbcClient jdbc, InboxService inbox) {
        this.jdbc = jdbc;
        this.inbox = inbox;
    }

    /**
     * Newest first, then by ID, {@code limit} at most, after {@code cursor} when given.
     *
     * @throws dev.sino.common.error.SinoException with {@code CONVERSATION_NOT_FOUND} when not in the inbox
     */
    public MessagePage page(UUID ownerId, UUID conversationId, MessageCursor cursor, int limit) {
        inbox.requireInInbox(ownerId, conversationId);
        // Keyset paging as for the inbox; one more row than asked tells whether there is a next page.
        JdbcClient.StatementSpec query = jdbc.sql("""
                SELECT m.id, m.direction, m.status, m.sent_at, m.text_content, m.is_read, m.recipients,
                       m.metadata ->> :subject AS subject,
                       p.external_participant_id AS sender, p.display_name AS sender_name, p.is_self
                FROM message m LEFT JOIN conversation_participant p ON p.id = m.sender_participant_id
                WHERE m.conversation_id = :conversation %s
                ORDER BY m.sent_at DESC, m.id DESC LIMIT :rows
                """.formatted(cursor == null ? ""
                : "AND m.sent_at <= :before AND (m.sent_at, m.id) < (:before, :beforeId)"))
                .param("subject", NormalizedMessage.SUBJECT).param("conversation", conversationId)
                .param("rows", limit + 1);
        if (cursor != null) {
            query = query.param("before", cursor.sentAt().atOffset(ZoneOffset.UTC)).param("beforeId", cursor.id());
        }
        List<InboxMessage> rows = query.query((row, n) -> {
            Recipients recipients = recipientsOf(row.getString("recipients"));
            String sender = row.getString("sender");
            return new InboxMessage(row.getObject("id", UUID.class),
                    MessageDirection.valueOf(row.getString("direction")),
                    MessageStatus.valueOf(row.getString("status")),
                    row.getObject("sent_at", OffsetDateTime.class).toInstant(),
                    sender == null ? null : new Sender(row.getString("sender_name"), sender, row.getBoolean("is_self")),
                    recipients == null ? null : recipients.to(), recipients == null ? null : recipients.cc(),
                    row.getString("subject"), row.getString("text_content"), row.getBoolean("is_read"), List.of());
        }).list();
        List<InboxMessage> items = withFiles(rows.size() <= limit ? rows : rows.subList(0, limit));
        if (rows.size() <= limit) {
            return new MessagePage(items, null);
        }
        InboxMessage last = items.getLast();
        return new MessagePage(items, new MessageCursor(last.sentAt(), last.id()));
    }

    private List<InboxMessage> withFiles(List<InboxMessage> messages) {
        if (messages.isEmpty()) {
            return messages;
        }
        Map<UUID, List<File>> files = new HashMap<>();
        jdbc.sql("""
                SELECT message_id, id, file_name, mime_type, size_bytes FROM attachment
                WHERE message_id IN (:messages) ORDER BY id
                """).param("messages", messages.stream().map(InboxMessage::id).toList())
                .query(row -> {
                    files.computeIfAbsent(row.getObject("message_id", UUID.class), id -> new ArrayList<>())
                            .add(new File(row.getObject("id", UUID.class), row.getString("file_name"),
                                    row.getString("mime_type"), row.getObject("size_bytes", Long.class)));
                });
        return messages.stream().map(m -> new InboxMessage(m.id(), m.direction(), m.status(), m.sentAt(), m.sender(),
                m.to(), m.cc(), m.subject(), m.text(), m.read(), List.copyOf(files.getOrDefault(m.id(), List.of()))))
                .toList();
    }

    private static Recipients recipientsOf(String json) {
        return json == null ? null : JSON.readValue(json, Recipients.class);
    }

    /** The addressees as the store keeps them ({@code message.recipients}); a key added later is skipped. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Recipients(List<Address> to, List<Address> cc, List<Address> replyTo) {
    }

}
