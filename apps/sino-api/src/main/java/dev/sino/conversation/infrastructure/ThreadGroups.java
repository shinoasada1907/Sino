package dev.sino.conversation.infrastructure;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountSummary;
import dev.sino.provider.spi.NormalizedMessage;

/**
 * Groups of conversations that are one thread found in several accounts of the owner (F05b, D-180): the same owner
 * and provider, different accounts, a message with the same {@code Message-ID}, and so on from one shared message to
 * the next, even when that ties two threads of one mailbox together. Groups only ever join; a joined group takes its
 * oldest conversation as {@code grouped_with}. The groups of one owner change one transaction at a time, under a lock
 * of the owner taken right after the lock of the account and before any conversation is written, so two syncs storing
 * the two copies of a message at once cannot each miss the other's, nor wait for each other's rows.
 */
@Repository
public class ThreadGroups {

    // The expression the index of V19 is on, so the copies of a message are found through it.
    private static final String MESSAGE_ID = "metadata ->> '%s'".formatted(NormalizedMessage.RFC_MESSAGE_ID);

    private final JdbcClient jdbc;
    private final AccountDirectory directory;
    private final TransactionTemplate transactions;

    ThreadGroups(JdbcClient jdbc, AccountDirectory directory, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.directory = directory;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    /**
     * The owner's other accounts of the same provider, whose conversations may share mail with this account's, after
     * taking the lock of the owner's groups for the rest of the caller's transaction; empty, and no lock taken, when
     * there is none. The caller holds the lock of the account and has written no conversation yet.
     */
    public List<UUID> lock(UUID accountId) {
        AccountSummary account = directory.byId(accountId).orElse(null);
        if (account == null) {
            return List.of();
        }
        List<UUID> others = directory.accountsOf(account.ownerId()).stream()
                .filter(other -> other.provider().equals(account.provider()) && !other.id().equals(accountId))
                .map(AccountSummary::id).toList();
        if (!others.isEmpty()) {
            jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                    .param("key", "thread-groups:" + account.ownerId()).query().singleRow();
        }
        return others;
    }

    /**
     * Joins the groups of the conversations holding these messages with those of the {@code others} accounts that
     * hold a copy of one. A copy stored later is joined when that copy is stored. The caller holds the lock of
     * {@link #lock}.
     */
    public void group(List<UUID> others, Collection<UUID> messageIds) {
        if (!others.isEmpty() && !messageIds.isEmpty()) {
            join(others, "m1.id IN (:mine)", Map.of("mine", messageIds));
        }
    }

    /**
     * Groups all the mail stored, as storing it now would, for the mail stored before groups existed (D-180): one
     * short transaction per account, so syncs wait for a single account's turn at most.
     */
    public void groupAll() {
        for (UUID accountId : jdbc.sql("SELECT DISTINCT account_id FROM conversation").query(UUID.class).list()) {
            transactions.executeWithoutResult(status -> {
                List<UUID> others = lock(accountId);
                if (!others.isEmpty()) {
                    join(others, "c1.account_id = :account", Map.of("account", accountId));
                }
            });
        }
    }

    private void join(List<UUID> others, String mine, Map<String, Object> mineParams) {
        List<UUID[]> shared = jdbc.sql("""
                SELECT DISTINCT c1.thread_group_id AS mine, c2.thread_group_id AS theirs
                FROM conversation c1
                JOIN message m1 ON m1.conversation_id = c1.id AND m1.%1$s IS NOT NULL
                JOIN message m2 ON m2.%1$s = m1.%1$s AND m2.%1$s IS NOT NULL
                JOIN conversation c2 ON c2.id = m2.conversation_id
                WHERE %2$s AND c2.account_id IN (:others) AND c1.thread_group_id <> c2.thread_group_id
                """.formatted(MESSAGE_ID, mine)).params(mineParams).param("others", others)
                .query((row, n) -> new UUID[] { row.getObject("mine", UUID.class),
                        row.getObject("theirs", UUID.class) })
                .list();
        for (Set<UUID> groups : joined(shared)) {
            jdbc.sql("""
                    UPDATE conversation
                    SET grouped_with = (SELECT id FROM conversation WHERE thread_group_id IN (:groups)
                                        ORDER BY created_at, id LIMIT 1)
                    WHERE thread_group_id IN (:groups)
                    """).param("groups", groups).update();
        }
    }

    // The groups that a chain of shared messages ties together, two groups or more each (union-find).
    private static Collection<Set<UUID>> joined(List<UUID[]> shared) {
        Map<UUID, UUID> parent = new HashMap<>();
        for (UUID[] pair : shared) {
            UUID first = root(parent, pair[0]);
            UUID second = root(parent, pair[1]);
            if (!first.equals(second)) {
                parent.put(first, second);
            }
        }
        Map<UUID, Set<UUID>> components = new LinkedHashMap<>();
        for (UUID group : parent.keySet()) {
            components.computeIfAbsent(root(parent, group), first -> new LinkedHashSet<>(List.of(first))).add(group);
        }
        return components.values();
    }

    private static UUID root(Map<UUID, UUID> parent, UUID group) {
        UUID root = group;
        while (parent.containsKey(root)) {
            root = parent.get(root);
        }
        return root;
    }

}
