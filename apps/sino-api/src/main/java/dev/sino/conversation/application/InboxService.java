package dev.sino.conversation.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountSummary;
import dev.sino.conversation.infrastructure.ConversationSummaries;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;

/**
 * The inbox of one owner (F05 design, section 4): the conversations of its accounts that are neither removed (D-66)
 * nor disabled, read straight with SQL. A change made here stays in Sino (D-67) and goes through the lock of the
 * account and the same summary as storing a page, so the two never overwrite each other.
 */
@Service
@Transactional(readOnly = true)
public class InboxService {

    private static final String COLUMNS = """
            c.id, c.account_id, c.type, c.title, c.counterpart, c.last_message_from, c.last_message_preview,
            c.last_message_at, c.unread_count, c.needs_reply, c.has_attachments, c.archived,
            CASE WHEN c.type IN ('GROUP', 'CHANNEL')
                 THEN (SELECT count(*) FROM conversation_participant p WHERE p.conversation_id = c.id) END
                AS participants
            """;

    private final JdbcClient jdbc;
    private final AccountDirectory directory;
    private final ConversationSummaries summaries;

    InboxService(JdbcClient jdbc, AccountDirectory directory, ConversationSummaries summaries) {
        this.jdbc = jdbc;
        this.directory = directory;
        this.summaries = summaries;
    }

    /**
     * Newest first, then by ID, {@code limit} at most, after {@code cursor} when given. {@code provider} and
     * {@code accountId} narrow the accounts; one that is not in the inbox leaves nothing.
     */
    public InboxPage page(UUID ownerId, InboxView view, String provider, UUID accountId, InboxCursor cursor,
            int limit) {
        Map<UUID, ProviderType> accounts = accountsOf(ownerId);
        // Provider types are lower case; an empty provider filters nothing.
        String type = provider == null || provider.isBlank() ? null : provider.strip().toLowerCase(Locale.ROOT);
        accounts.entrySet().removeIf(account -> (type != null && !account.getValue().value().equals(type))
                || (accountId != null && !account.getKey().equals(accountId)));
        if (accounts.isEmpty() || view.alwaysEmpty()) {
            return new InboxPage(List.of(), null);
        }
        // The newest page of each account on its own (conversation_account_inbox_idx), then the newest of those: a
        // plain "account_id IN (...)" walked past every newer conversation of other accounts first (docs/knowledge
        // phase 2, section 15.4). Keyset paging: the row comparison goes on right after the last conversation of the
        // page before. One more row than asked tells whether there is a next page.
        JdbcClient.StatementSpec query = jdbc.sql("SELECT c.* FROM unnest(ARRAY[:accounts]::uuid[]) AS a(id)"
                + " CROSS JOIN LATERAL (SELECT " + COLUMNS + " FROM conversation c"
                + " WHERE c.account_id = a.id AND " + view.condition()
                + (cursor == null ? ""
                        : " AND c.last_message_at <= :after AND (c.last_message_at, c.id) < (:after, :afterId)")
                + " ORDER BY c.last_message_at DESC, c.id DESC LIMIT :rows) c"
                + " ORDER BY c.last_message_at DESC, c.id DESC LIMIT :rows")
                .param("accounts", accounts.keySet()).param("rows", limit + 1);
        if (cursor != null) {
            query = query.param("after", cursor.lastMessageAt().atOffset(ZoneOffset.UTC))
                    .param("afterId", cursor.id());
        }
        List<InboxItem> rows = query.query((row, n) -> item(row, accounts)).list();
        if (rows.size() <= limit) {
            return new InboxPage(rows, null);
        }
        InboxItem last = rows.get(limit - 1);
        return new InboxPage(rows.subList(0, limit), new InboxCursor(last.lastMessageAt(), last.id()));
    }

    public InboxCounts counts(UUID ownerId) {
        Map<UUID, ProviderType> accounts = accountsOf(ownerId);
        Map<String, Long> unreadByProvider = new TreeMap<>();
        accounts.values().forEach(provider -> unreadByProvider.put(provider.value(), 0L));
        if (accounts.isEmpty()) {
            return new InboxCounts(0, unreadByProvider, 0, 0);
        }
        List<AccountCounts> perAccount = jdbc.sql("""
                SELECT c.account_id,
                       count(*) FILTER (WHERE c.unread_count > 0) AS unread,
                       count(*) FILTER (WHERE c.needs_reply) AS needs_reply,
                       count(*) FILTER (WHERE c.has_attachments) AS with_attachments
                FROM conversation c
                WHERE c.account_id IN (:accounts) AND NOT c.archived
                GROUP BY c.account_id
                """).param("accounts", accounts.keySet())
                .query((row, n) -> new AccountCounts(row.getObject("account_id", UUID.class), row.getLong("unread"),
                        row.getLong("needs_reply"), row.getLong("with_attachments")))
                .list();
        perAccount.forEach(counts -> unreadByProvider.merge(accounts.get(counts.accountId()).value(), counts.unread(),
                Long::sum));
        return new InboxCounts(perAccount.stream().mapToLong(AccountCounts::unread).sum(), unreadByProvider,
                perAccount.stream().mapToLong(AccountCounts::needsReply).sum(),
                perAccount.stream().mapToLong(AccountCounts::withAttachments).sum());
    }

    /**
     * The conversation and its participants, in the order they were first stored.
     *
     * @throws dev.sino.common.error.SinoException with {@code CONVERSATION_NOT_FOUND} when not in the inbox
     */
    public InboxDetail detail(UUID ownerId, UUID conversationId) {
        InboxItem conversation = find(accountsOf(ownerId), conversationId)
                .orElseThrow(ConversationErrorCode::conversationNotFound);
        List<InboxParticipant> participants = jdbc.sql("""
                SELECT external_participant_id, display_name, avatar_url, is_self FROM conversation_participant
                WHERE conversation_id = :conversation ORDER BY id
                """).param("conversation", conversationId)
                .query((row, n) -> new InboxParticipant(row.getString(1), row.getString(2), row.getString(3),
                        row.getBoolean(4)))
                .list();
        return new InboxDetail(conversation, participants);
    }

    /**
     * Read: every message read; unread: the newest message unread again. Archived on or off. A {@code null} leaves
     * that part as it is. Only in Sino: what the provider said ({@code provider_read}) stays, and nothing is sent to
     * the provider (D-67).
     *
     * @throws dev.sino.common.error.SinoException with {@code CONVERSATION_NOT_FOUND} when not in the inbox
     */
    @Transactional
    public InboxItem change(UUID ownerId, UUID conversationId, Boolean read, Boolean archived) {
        Map<UUID, ProviderType> accounts = accountsOf(ownerId);
        InboxItem conversation = find(accounts, conversationId)
                .orElseThrow(ConversationErrorCode::conversationNotFound);
        summaries.lock(conversation.accountId());
        if (Boolean.TRUE.equals(read)) {
            jdbc.sql("""
                    UPDATE message SET is_read = true, updated_at = now()
                    WHERE conversation_id = :conversation AND NOT is_read
                    """).param("conversation", conversationId).update();
        } else if (Boolean.FALSE.equals(read)) {
            jdbc.sql("""
                    UPDATE message SET is_read = false, updated_at = now()
                    WHERE id = (SELECT m.id FROM message m WHERE m.conversation_id = :conversation
                                ORDER BY m.sent_at DESC, m.id DESC LIMIT 1)
                      AND is_read
                    """).param("conversation", conversationId).update();
        }
        if (archived != null) {
            jdbc.sql("""
                    UPDATE conversation SET archived = :archived, updated_at = now()
                    WHERE id = :conversation AND archived <> :archived
                    """).param("archived", archived).param("conversation", conversationId).update();
        }
        summaries.summarize(List.of(conversationId));
        return find(accounts, conversationId).orElseThrow(ConversationErrorCode::conversationNotFound);
    }

    private Optional<InboxItem> find(Map<UUID, ProviderType> accounts, UUID conversationId) {
        if (accounts.isEmpty()) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT " + COLUMNS + " FROM conversation c WHERE c.id = :id AND c.account_id IN (:accounts)")
                .param("id", conversationId).param("accounts", accounts.keySet())
                .query((row, n) -> item(row, accounts)).optional();
    }

    // The accounts of the inbox and their provider: not removed (the directory leaves those out), not disabled.
    private Map<UUID, ProviderType> accountsOf(UUID ownerId) {
        return directory.accountsOf(ownerId).stream()
                .filter(account -> account.status() != AccountStatus.DISABLED)
                .collect(Collectors.toMap(AccountSummary::id, AccountSummary::provider, (first, again) -> first,
                        LinkedHashMap::new));
    }

    private record AccountCounts(UUID accountId, long unread, long needsReply, long withAttachments) {
    }

    private static InboxItem item(ResultSet row, Map<UUID, ProviderType> accounts) throws SQLException {
        UUID accountId = row.getObject("account_id", UUID.class);
        return new InboxItem(row.getObject("id", UUID.class), accountId, accounts.get(accountId),
                ConversationType.valueOf(row.getString("type")), row.getString("title"),
                row.getString("counterpart"), row.getString("last_message_from"),
                row.getString("last_message_preview"),
                row.getObject("last_message_at", OffsetDateTime.class).toInstant(), row.getInt("unread_count"),
                row.getBoolean("needs_reply"), row.getBoolean("has_attachments"), row.getBoolean("archived"),
                row.getInt("participants"));
    }

}
