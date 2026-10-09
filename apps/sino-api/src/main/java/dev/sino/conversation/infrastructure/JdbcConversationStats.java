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

}
