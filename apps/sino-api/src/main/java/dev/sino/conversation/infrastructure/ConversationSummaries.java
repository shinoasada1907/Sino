package dev.sino.conversation.infrastructure;

import java.util.Collection;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.provider.spi.NormalizedMessage;

/**
 * What every change to the mail of an account goes through: the lock of the account, then the summary of the
 * conversations it touched. Storing a page and a change made in Sino both write messages and summaries; without the
 * lock, a summary worked out from data read before the other one committed would overwrite its result.
 */
@Component
@Transactional(propagation = Propagation.MANDATORY)
public class ConversationSummaries {

    private final JdbcClient jdbc;

    ConversationSummaries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Waits until no other transaction holds the lock of the account, then holds it until this transaction ends.
     * Changes of one account take turns; other accounts do not wait.
     */
    public void lock(UUID accountId) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "conversation:" + accountId).query().singleRow();
    }

    /**
     * Works out again, from all their stored messages, the summary of these conversations (F05 design, section 2, step
     * 5), so a page that holds a single old message cannot make it wrong. Written only where a value changed. The
     * caller holds the lock of their account.
     */
    public void summarize(Collection<UUID> conversations) {
        if (conversations.isEmpty()) {
            return;
        }
        jdbc.sql("""
                WITH summary AS (
                    SELECT c.id,
                           COALESCE(latest.sent_at, c.last_message_at) AS last_message_at,
                           latest.preview,
                           latest.sender AS last_message_from,
                           COALESCE(
                               (SELECT COALESCE(p.display_name, p.external_participant_id)
                                FROM message m JOIN conversation_participant p ON p.id = m.sender_participant_id
                                WHERE m.conversation_id = c.id AND m.direction = 'INBOUND'
                                ORDER BY m.sent_at DESC, m.id DESC LIMIT 1),
                               (SELECT COALESCE(p.display_name, p.external_participant_id)
                                FROM conversation_participant p
                                WHERE p.conversation_id = c.id AND NOT p.is_self
                                ORDER BY p.id LIMIT 1)) AS counterpart,
                           (SELECT count(*) FROM message m
                            WHERE m.conversation_id = c.id AND NOT m.is_read)::integer AS unread_count,
                           EXISTS (SELECT 1 FROM attachment a JOIN message m ON m.id = a.message_id
                                   WHERE m.conversation_id = c.id AND a.content_id IS NULL) AS has_attachments,
                           COALESCE(latest.needs_reply, false) AS needs_reply
                    FROM conversation c
                    LEFT JOIN LATERAL (
                        SELECT m.sent_at,
                               NULLIF(rtrim(left(btrim(regexp_replace(m.text_content,
                                   '[[:space:]' || chr(160) || ']+', ' ', 'g')), 200)), '') AS preview,
                               COALESCE(p.display_name, p.external_participant_id) AS sender,
                               m.direction = 'INBOUND' AND COALESCE(m.metadata ->> :bulk, '') <> 'true' AS needs_reply
                        FROM message m LEFT JOIN conversation_participant p ON p.id = m.sender_participant_id
                        WHERE m.conversation_id = c.id
                        ORDER BY m.sent_at DESC, m.id DESC
                        LIMIT 1) latest ON true
                    WHERE c.id IN (:conversations)
                )
                UPDATE conversation c
                SET last_message_at = s.last_message_at,
                    last_message_preview = s.preview,
                    last_message_from = s.last_message_from,
                    counterpart = s.counterpart,
                    unread_count = s.unread_count,
                    has_attachments = s.has_attachments,
                    needs_reply = s.needs_reply,
                    updated_at = now()
                FROM summary s
                WHERE c.id = s.id
                  AND (c.last_message_at, c.last_message_preview, c.last_message_from, c.counterpart, c.unread_count,
                       c.has_attachments, c.needs_reply)
                      IS DISTINCT FROM
                      (s.last_message_at, s.preview, s.last_message_from, s.counterpart, s.unread_count,
                       s.has_attachments, s.needs_reply)
                """).param("conversations", conversations).param("bulk", NormalizedMessage.BULK).update();
    }

}
