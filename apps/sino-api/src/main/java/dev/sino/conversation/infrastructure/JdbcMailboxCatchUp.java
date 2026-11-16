package dev.sino.conversation.infrastructure;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.conversation.MailboxCatchUp;

/** {@link MailboxCatchUp} on the tables {@code message} and {@code conversation}. */
@Repository
@Transactional(propagation = Propagation.MANDATORY)
class JdbcMailboxCatchUp implements MailboxCatchUp {

    private final JdbcClient jdbc;
    private final ConversationSummaries summaries;

    JdbcMailboxCatchUp(JdbcClient jdbc, ConversationSummaries summaries) {
        this.jdbc = jdbc;
        this.summaries = summaries;
    }

    // Read-only and called outside any transaction by the caller, which has no use for one here.
    @Override
    @Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
    public Set<String> notStored(UUID accountId, Collection<String> externalMessageIds) {
        if (externalMessageIds.isEmpty()) {
            return Set.of();
        }
        Set<String> missing = new HashSet<>(externalMessageIds);
        missing.removeAll(jdbc.sql("""
                SELECT m.external_message_id FROM message m JOIN conversation c ON c.id = m.conversation_id
                WHERE c.account_id = :account AND m.external_message_id = ANY(:ids)
                """).param("account", accountId).param("ids", externalMessageIds.toArray(String[]::new))
                .query(String.class).set());
        return missing;
    }

    @Override
    public Set<UUID> apply(UUID accountId, Collection<String> spam, Collection<String> trash,
            Collection<String> archive) {
        summaries.lock(accountId);
        Set<UUID> changed = new HashSet<>();
        // Trash first, as mailboxOf does: a message in both lists is in the bin.
        changed.addAll(set(accountId, "TRASH", trash));
        changed.addAll(set(accountId, "SPAM", spam));
        changed.addAll(set(accountId, "ARCHIVE", archive));
        changed.addAll(jdbc.sql("""
                UPDATE message m SET mailbox = 'INBOX', updated_at = now()
                FROM conversation c
                WHERE c.id = m.conversation_id AND c.account_id = :account
                  AND m.mailbox IS NULL AND m.direction = 'INBOUND'
                RETURNING m.conversation_id
                """).param("account", accountId).query(UUID.class).set());
        summaries.summarize(changed);
        return changed;
    }

    private Set<UUID> set(UUID accountId, String mailbox, Collection<String> externalIds) {
        if (externalIds.isEmpty()) {
            return Set.of();
        }
        return jdbc.sql("""
                UPDATE message m SET mailbox = :mailbox, updated_at = now()
                FROM conversation c
                WHERE c.id = m.conversation_id AND c.account_id = :account AND m.mailbox IS NULL
                  AND m.external_message_id = ANY(:ids)
                RETURNING m.conversation_id
                """).param("mailbox", mailbox).param("account", accountId)
                .param("ids", externalIds.toArray(String[]::new)).query(UUID.class).set();
    }

}
