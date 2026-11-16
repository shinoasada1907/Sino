package dev.sino.conversation.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.AccountListing;
import dev.sino.account.AccountRoster;
import dev.sino.account.AccountStatus;
import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.NicknameSync;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

/**
 * {@link NicknameSync} in plain SQL (zalo-nicknames, D-418): every DIRECT conversation of an account is rewritten to
 * match what the provider's {@code nicknames().list} gives, oldest decision ("Zalo là bản gốc") winning when the
 * owner and the provider disagree, since the next sync always follows the provider. Never inside a transaction while
 * the provider is asked ({@link ProviderAccess}); the write that follows is its own, short transaction.
 */
@Service
public class NicknameSyncService implements NicknameSync {

    private static final Logger log = LoggerFactory.getLogger(NicknameSyncService.class);

    private final JdbcClient jdbc;
    private final AccountRoster roster;
    private final ProviderRegistry providers;
    private final ProviderAccess access;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;

    NicknameSyncService(JdbcClient jdbc, AccountRoster roster, ProviderRegistry providers, ProviderAccess access,
            TransactionTemplate transactions, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.roster = roster;
        this.providers = providers;
        this.access = access;
        this.transactions = transactions;
        this.events = events;
    }

    @Override
    public void syncAll() {
        for (AccountListing account : roster.allAccounts()) {
            if (usable(account) && hasNicknames(account)) {
                sync(account.id());
            }
        }
    }

    @Override
    public void sync(UUID accountId) {
        Map<String, String> aliases;
        try {
            aliases = access.call(accountId, (connector, context) -> connector.nicknames()
                    .orElseThrow(() -> new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                            connector.type() + " has no nicknames"))
                    .list(context));
        } catch (ProviderException failure) {
            log.warn("Nicknames of account {} were not synced: {}", accountId, failure.errorCode());
            return;
        } catch (SinoException failure) {
            // ProviderAccess: the account was removed, turned off, or its connector is gone since the roster was read.
            log.warn("Nicknames of account {} were not synced: {}", accountId, failure.errorCode().code());
            return;
        }
        List<UUID> changed = transactions.execute(status -> write(accountId, aliases));
        if (changed != null) {
            for (UUID conversationId : changed) {
                events.publishEvent(new ConversationChanged(accountId, conversationId, Instant.now()));
            }
        }
    }

    // Rows holding a nickname the provider no longer names are cleared; the account's friends with one are set in
    // bulk with unnest, IS DISTINCT FROM leaving a row that already matches untouched (D-418, the hint of NK-02).
    private List<UUID> write(UUID accountId, Map<String, String> aliases) {
        List<UUID> changed = new ArrayList<>();
        if (aliases.isEmpty()) {
            return jdbc.sql("""
                    UPDATE conversation SET nickname = NULL, updated_at = now()
                    WHERE account_id = :account AND type = 'DIRECT' AND nickname IS NOT NULL
                    RETURNING id
                    """).param("account", accountId).query(UUID.class).list();
        }
        List<String> friendIds = new ArrayList<>(aliases.size());
        List<String> values = new ArrayList<>(aliases.size());
        for (Map.Entry<String, String> alias : aliases.entrySet()) {
            friendIds.add(alias.getKey());
            values.add(alias.getValue());
        }
        changed.addAll(jdbc.sql("""
                UPDATE conversation SET nickname = NULL, updated_at = now()
                WHERE account_id = :account AND type = 'DIRECT' AND nickname IS NOT NULL
                  AND external_conversation_id NOT IN (:friendIds)
                RETURNING id
                """).param("account", accountId).param("friendIds", friendIds).query(UUID.class).list());
        changed.addAll(jdbc.sql("""
                UPDATE conversation c SET nickname = v.alias, updated_at = now()
                FROM (SELECT unnest(ARRAY[:friendIds]::text[]) AS friend_id,
                             unnest(ARRAY[:aliasValues]::text[]) AS alias) v
                WHERE c.account_id = :account AND c.type = 'DIRECT' AND c.external_conversation_id = v.friend_id
                  AND c.nickname IS DISTINCT FROM v.alias
                RETURNING c.id
                """).param("account", accountId).param("friendIds", friendIds).param("aliasValues", values)
                .query(UUID.class).list());
        return changed;
    }

    private static boolean usable(AccountListing account) {
        return account.status() != AccountStatus.DISABLED && account.status() != AccountStatus.AUTH_EXPIRED;
    }

    private boolean hasNicknames(AccountListing account) {
        return providers.find(account.provider())
                .filter(connector -> connector.capabilities().supports(ProviderCapability.NICKNAMES)).isPresent();
    }

}
