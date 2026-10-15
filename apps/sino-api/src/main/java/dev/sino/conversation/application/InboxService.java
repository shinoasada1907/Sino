package dev.sino.conversation.application;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountSummary;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.InboxIds;
import dev.sino.conversation.infrastructure.ConversationSummaries;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.NormalizedMessage;

/**
 * The inbox of one owner (F05 design, section 4): the conversations of its accounts that are neither removed (D-66)
 * nor disabled, read straight with SQL. A thread found in several of those accounts is one row (F05b, D-180…D-187),
 * worked out from all its copies when it is read. A change made here stays in Sino (D-67) and goes through the lock of
 * each account and the same summary as storing a page, so the two never overwrite each other.
 */
@Service
@Transactional(readOnly = true)
public class InboxService implements InboxIds {

    // The groups of the inbox: their copies oldest first, the first of them naming the group (D-183), and the fields
    // worked out from every copy (D-182), under the names of the conversation table, so the conditions of InboxView
    // apply to a group as they are. %1$s narrows the conversations, %2$s the groups.
    private static final String GROUPS = """
            SELECT array_agg(c.id ORDER BY c.created_at, c.id) AS copies,
                   (array_agg(c.id ORDER BY c.created_at, c.id))[1] AS id,
                   (array_agg(c.account_id ORDER BY c.created_at, c.id))[1] AS account_id,
                   max(c.last_message_at) AS last_message_at, max(c.unread_count) AS unread_count,
                   bool_and(c.needs_reply) AS needs_reply, bool_or(c.has_attachments) AS has_attachments,
                   bool_and(c.archived) AS archived
            FROM conversation c
            WHERE c.account_id IN (:accounts) %1$s
            GROUP BY c.thread_group_id %2$s
            """;

    // Each copy with what a row takes from its primary copy, and the newest message that copy holds as its summary
    // counts it (ConversationSummaries): the Message-ID and whether it came in, to find the primary copy (D-181).
    private static final String COPIES = """
            SELECT c.id, c.account_id, c.type, c.title, c.counterpart, c.last_message_from, c.last_message_preview,
                   c.last_message_at,
                   CASE WHEN c.type IN ('GROUP', 'CHANNEL')
                        THEN (SELECT count(*) FROM conversation_participant p WHERE p.conversation_id = c.id) END
                       AS participants,
                   newest.message_id AS newest_message_id, COALESCE(newest.inbound, false) AS newest_inbound
            FROM conversation c
            LEFT JOIN LATERAL (
                SELECT m.metadata ->> :messageId AS message_id, m.direction = 'INBOUND' AS inbound
                FROM message m
                WHERE m.conversation_id = c.id AND (m.client_message_id IS NULL OR m.status = 'SENT')
                ORDER BY m.sent_at DESC, m.id DESC
                LIMIT 1) newest ON true
            WHERE c.id IN (:copies)
            """;

    private final JdbcClient jdbc;
    private final AccountDirectory directory;
    private final ConversationSummaries summaries;
    private final Replies replies;
    private final ApplicationEventPublisher events;

    InboxService(JdbcClient jdbc, AccountDirectory directory, ConversationSummaries summaries, Replies replies,
            ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.directory = directory;
        this.summaries = summaries;
        this.replies = replies;
        this.events = events;
    }

    /**
     * Newest first, then by ID, {@code limit} at most, after {@code cursor} when given, one row a group. {@code provider}
     * narrows the accounts; {@code accountId} keeps the groups with a copy in that account (D-187). One that is not in
     * the inbox leaves nothing.
     */
    public InboxPage page(UUID ownerId, InboxView view, String provider, UUID accountId, InboxCursor cursor,
            int limit) {
        Map<UUID, ProviderType> accounts = accountsOf(ownerId);
        // Provider types are lower case; an empty provider filters nothing.
        String type = provider == null || provider.isBlank() ? null : provider.strip().toLowerCase(Locale.ROOT);
        accounts.entrySet().removeIf(account -> type != null && !account.getValue().value().equals(type));
        if (accounts.isEmpty() || view.alwaysEmpty() || (accountId != null && !accounts.containsKey(accountId))) {
            return new InboxPage(List.of(), null);
        }
        // Every group of the owner is worked out for each page: the time of a group is that of its newest copy, so no
        // index on one copy gives the order (F05b design, Risks). Keyset paging on the time and the ID of the group;
        // one more row than asked tells whether there is a next page.
        String inbox = GROUPS.formatted("", accountId == null ? "" : "HAVING bool_or(c.account_id = :account)");
        JdbcClient.StatementSpec query = jdbc.sql("SELECT c.* FROM (" + inbox + ") c WHERE " + view.condition()
                + (cursor == null ? "" : " AND (c.last_message_at, c.id) < (:after, :afterId)")
                + " ORDER BY c.last_message_at DESC, c.id DESC LIMIT :rows")
                .param("accounts", accounts.keySet()).param("rows", limit + 1);
        if (accountId != null) {
            query = query.param("account", accountId);
        }
        if (cursor != null) {
            query = query.param("after", cursor.lastMessageAt().atOffset(ZoneOffset.UTC))
                    .param("afterId", cursor.id());
        }
        List<Group> groups = query.query((row, n) -> group(row)).list();
        if (groups.size() <= limit) {
            return new InboxPage(items(accounts, groups), null);
        }
        Group last = groups.get(limit - 1);
        return new InboxPage(items(accounts, groups.subList(0, limit)),
                new InboxCursor(last.lastMessageAt(), last.id()));
    }

    /** Groups that are not archived, each once, by the fields of their row (D-187). */
    public InboxCounts counts(UUID ownerId) {
        Map<UUID, ProviderType> accounts = accountsOf(ownerId);
        Map<String, Long> unreadByProvider = new TreeMap<>();
        accounts.values().forEach(provider -> unreadByProvider.put(provider.value(), 0L));
        if (accounts.isEmpty()) {
            return new InboxCounts(0, unreadByProvider, 0, 0);
        }
        // Every copy of a group has the provider of the group: one account of each group names it.
        List<AccountCounts> perAccount = jdbc.sql("""
                SELECT g.account_id,
                       count(*) FILTER (WHERE g.unread_count > 0) AS unread,
                       count(*) FILTER (WHERE g.needs_reply) AS needs_reply,
                       count(*) FILTER (WHERE g.has_attachments) AS with_attachments
                FROM (%s) g
                WHERE NOT g.archived
                GROUP BY g.account_id
                """.formatted(GROUPS.formatted("", ""))).param("accounts", accounts.keySet())
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
     * The group of the conversation, the participants of all its copies, each once, in the order they were first
     * stored, and whether and to whom the owner can reply from its primary copy (D-186).
     *
     * @throws dev.sino.common.error.SinoException with {@code CONVERSATION_NOT_FOUND} when not in the inbox
     */
    public InboxDetail detail(UUID ownerId, UUID conversationId) {
        InboxItem conversation = requireInInbox(ownerId, conversationId);
        // A name or picture from the copy that stored it first; any account of the owner is self.
        List<InboxParticipant> participants = jdbc.sql("""
                SELECT external_participant_id,
                       (array_agg(display_name ORDER BY id) FILTER (WHERE display_name IS NOT NULL))[1],
                       (array_agg(avatar_url ORDER BY id) FILTER (WHERE avatar_url IS NOT NULL))[1],
                       bool_or(is_self)
                FROM conversation_participant
                WHERE conversation_id IN (:copies)
                GROUP BY external_participant_id
                ORDER BY (array_agg(id ORDER BY id))[1]
                """).param("copies", conversation.conversationIds())
                .query((row, n) -> new InboxParticipant(row.getString(1), row.getString(2), row.getString(3),
                        row.getBoolean(4)))
                .list();
        return new InboxDetail(conversation, participants, replies.of(ownerId, conversation));
    }

    /**
     * Read: every message of every copy read; unread: the newest message of the primary copy unread again. Archived on
     * or off for every copy (D-185). A {@code null} leaves that part as it is. Only in Sino: what the provider said
     * ({@code provider_read}) stays, and nothing is sent to the provider (D-67).
     *
     * @throws dev.sino.common.error.SinoException with {@code CONVERSATION_NOT_FOUND} when not in the inbox
     */
    @Transactional
    public InboxItem change(UUID ownerId, UUID conversationId, Boolean read, Boolean archived) {
        Map<UUID, ProviderType> accounts = accountsOf(ownerId);
        InboxItem conversation = find(accounts, conversationId)
                .orElseThrow(ConversationErrorCode::conversationNotFound);
        summaries.lockAll(conversation.accountIds());
        List<UUID> copies = conversation.conversationIds();
        if (Boolean.TRUE.equals(read)) {
            jdbc.sql("""
                    UPDATE message SET is_read = true, updated_at = now()
                    WHERE conversation_id IN (:copies) AND NOT is_read
                    """).param("copies", copies).update();
        } else if (Boolean.FALSE.equals(read)) {
            jdbc.sql("""
                    UPDATE message SET is_read = false, updated_at = now()
                    WHERE id = (SELECT m.id FROM message m WHERE m.conversation_id = :conversation
                                ORDER BY m.sent_at DESC, m.id DESC LIMIT 1)
                      AND is_read
                    """).param("conversation", conversation.primaryId()).update();
        }
        if (archived != null) {
            jdbc.sql("""
                    UPDATE conversation SET archived = :archived, updated_at = now()
                    WHERE id IN (:copies) AND archived <> :archived
                    """).param("archived", archived).param("copies", copies).update();
        }
        summaries.summarize(copies);
        events.publishEvent(new ConversationChanged(conversation.accountId(), conversation.id(), Instant.now()));
        return find(accounts, conversation.id()).orElseThrow(ConversationErrorCode::conversationNotFound);
    }

    /**
     * The group of the conversation, archived or not, when one of the owner's accounts in the inbox has it.
     *
     * @throws dev.sino.common.error.SinoException with {@code CONVERSATION_NOT_FOUND} when not in the inbox
     */
    public InboxItem requireInInbox(UUID ownerId, UUID conversationId) {
        return find(accountsOf(ownerId), conversationId).orElseThrow(ConversationErrorCode::conversationNotFound);
    }

    @Override
    public List<UUID> of(UUID ownerId, Collection<UUID> conversationIds) {
        Map<UUID, ProviderType> accounts = accountsOf(ownerId);
        if (conversationIds.isEmpty() || accounts.isEmpty()) {
            return conversationIds.stream().distinct().toList();
        }
        Map<UUID, UUID> shown = new HashMap<>();
        jdbc.sql("""
                SELECT c.id,
                       (SELECT g.id FROM conversation g
                        WHERE g.thread_group_id = c.thread_group_id AND g.account_id IN (:accounts)
                        ORDER BY g.created_at, g.id LIMIT 1) AS shown
                FROM conversation c
                WHERE c.id IN (:conversations) AND c.account_id IN (:accounts)
                """).param("accounts", accounts.keySet()).param("conversations", conversationIds)
                .query(row -> {
                    shown.put(row.getObject("id", UUID.class), row.getObject("shown", UUID.class));
                });
        return conversationIds.stream().map(id -> shown.getOrDefault(id, id)).distinct().toList();
    }

    // The group of any of its copies in the inbox (D-183), read in one statement, so its copies are those of one moment.
    private Optional<InboxItem> find(Map<UUID, ProviderType> accounts, UUID conversationId) {
        if (accounts.isEmpty()) {
            return Optional.empty();
        }
        List<Group> group = jdbc.sql(GROUPS.formatted("""
                AND c.thread_group_id = (SELECT x.thread_group_id FROM conversation x
                                         WHERE x.id = :id AND x.account_id IN (:accounts))
                """, "")).param("id", conversationId).param("accounts", accounts.keySet())
                .query((row, n) -> group(row)).list();
        return items(accounts, group).stream().findFirst();
    }

    // The rows of these groups: what a row takes from the primary copy, read for the copies the groups were read with.
    // A copy gone since is left out, and a group left without any.
    private List<InboxItem> items(Map<UUID, ProviderType> accounts, List<Group> groups) {
        if (groups.isEmpty()) {
            return List.of();
        }
        Map<UUID, Copy> copies = new HashMap<>();
        jdbc.sql(COPIES).param("messageId", NormalizedMessage.RFC_MESSAGE_ID)
                .param("copies", groups.stream().flatMap(group -> group.copies().stream()).toList())
                .query(row -> {
                    Copy copy = copyOf(row);
                    copies.put(copy.id(), copy);
                });
        List<InboxItem> items = new ArrayList<>();
        for (Group group : groups) {
            List<Copy> found = group.copies().stream().map(copies::get).filter(Objects::nonNull).toList();
            if (!found.isEmpty()) {
                items.add(itemOf(group, found, accounts));
            }
        }
        return items;
    }

    private static InboxItem itemOf(Group group, List<Copy> copies, Map<UUID, ProviderType> accounts) {
        Copy primary = primaryOf(copies);
        List<UUID> accountIds = Stream.concat(Stream.of(primary.accountId()), copies.stream().map(Copy::accountId))
                .distinct().toList();
        return new InboxItem(group.id(), primary.id(), primary.accountId(), accountIds,
                copies.stream().map(copy -> new InboxItem.Copy(copy.id(), copy.accountId())).toList(),
                accounts.get(primary.accountId()), primary.type(), primary.title(), primary.counterpart(),
                primary.lastMessageFrom(), primary.preview(), group.lastMessageAt(), group.unreadCount(),
                group.needsReply(), group.hasAttachments(), group.archived(), primary.participants());
    }

    // D-181: the copy holding the newest message. Each mailbox dates its copy of a message on its own, so the copies
    // whose newest message has the same Message-ID hold it too; of those, the one it came in to, then the oldest.
    private static Copy primaryOf(List<Copy> copiesOldestFirst) {
        Copy newest = copiesOldestFirst.getFirst();
        for (Copy copy : copiesOldestFirst) {
            if (copy.lastMessageAt().isAfter(newest.lastMessageAt())) {
                newest = copy;
            }
        }
        Copy found = newest;
        List<Copy> holding = copiesOldestFirst.stream()
                .filter(copy -> copy.lastMessageAt().equals(found.lastMessageAt())
                        || (found.newestMessageId() != null && found.newestMessageId().equals(copy.newestMessageId())))
                .toList();
        return holding.stream().filter(Copy::newestInbound).findFirst().orElse(holding.getFirst());
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

    private record Group(List<UUID> copies, UUID id, Instant lastMessageAt, int unreadCount, boolean needsReply,
            boolean hasAttachments, boolean archived) {
    }

    private record Copy(UUID id, UUID accountId, ConversationType type, String title, String counterpart,
            String lastMessageFrom, String preview, Instant lastMessageAt, int participants, String newestMessageId,
            boolean newestInbound) {
    }

    private static Group group(ResultSet row) throws SQLException {
        Array copies = row.getArray("copies");
        return new Group(Arrays.asList((UUID[]) copies.getArray()), row.getObject("id", UUID.class),
                row.getObject("last_message_at", OffsetDateTime.class).toInstant(), row.getInt("unread_count"),
                row.getBoolean("needs_reply"), row.getBoolean("has_attachments"), row.getBoolean("archived"));
    }

    private static Copy copyOf(ResultSet row) throws SQLException {
        return new Copy(row.getObject("id", UUID.class), row.getObject("account_id", UUID.class),
                ConversationType.valueOf(row.getString("type")), row.getString("title"), row.getString("counterpart"),
                row.getString("last_message_from"), row.getString("last_message_preview"),
                row.getObject("last_message_at", OffsetDateTime.class).toInstant(), row.getInt("participants"),
                row.getString("newest_message_id"), row.getBoolean("newest_inbound"));
    }

}
