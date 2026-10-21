package dev.sino.conversation.infrastructure;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import dev.sino.conversation.ConversationStats;

@Repository
public class JdbcConversationStats implements ConversationStats {

    private final JdbcClient jdbc;

    JdbcConversationStats(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long storedMessages(UUID accountId) {
        return jdbc.sql("""
                SELECT count(*) FROM message m JOIN conversation c ON c.id = m.conversation_id
                WHERE c.account_id = :account
                """).param("account", accountId).query(Long.class).single();
    }

    /**
     * Rows are measured by {@code pg_column_size}, which gives what PostgreSQL keeps, compressed. Of a message only the
     * columns that grow with the mail are counted, each on its own: the size of a column kept out of line (TOAST) is
     * read without reading the column, where the size of the whole row would read every body (on 3 333 real messages,
     * 20 ms against 850 ms). The fixed part of a message row, some 150 bytes, is left out.
     */
    @Override
    public long storedBytes(UUID accountId) {
        return jdbc.sql("""
                SELECT (SELECT coalesce(sum(pg_column_size(c.*)), 0)
                          FROM conversation c WHERE c.account_id = :account)
                     + (SELECT coalesce(sum(pg_column_size(p.*)), 0)
                          FROM conversation_participant p JOIN conversation c ON c.id = p.conversation_id
                         WHERE c.account_id = :account)
                     + (SELECT coalesce(sum(pg_column_size(m.external_message_id)
                                            + coalesce(pg_column_size(m.text_content), 0)
                                            + coalesce(pg_column_size(m.html_content), 0)
                                            + pg_column_size(m.metadata)
                                            + coalesce(pg_column_size(m.recipients), 0)
                                            + coalesce(pg_column_size(m.reply_to_external_message_id), 0)), 0)
                          FROM message m JOIN conversation c ON c.id = m.conversation_id
                         WHERE c.account_id = :account)
                     + (SELECT coalesce(sum(pg_column_size(a.*)), 0)
                          FROM attachment a JOIN message m ON m.id = a.message_id
                          JOIN conversation c ON c.id = m.conversation_id
                         WHERE c.account_id = :account)
                """).param("account", accountId).query(Long.class).single();
    }

}
