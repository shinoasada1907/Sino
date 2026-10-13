package dev.sino.admin.application;

import static java.util.stream.Collectors.counting;
import static java.util.stream.Collectors.groupingBy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.sino.account.AccountListing;
import dev.sino.account.AccountRoster;
import dev.sino.account.AccountStatus;
import dev.sino.conversation.ConversationStats;
import dev.sino.identity.UserDirectory;
import dev.sino.sync.AccountSyncStatus;
import dev.sino.sync.SyncStatuses;

/**
 * What the person who runs Sino sees (D-264): users, connected accounts and how their reading goes, as numbers and
 * statuses only, never mail. Read through the public API of each module (D-265); the status and the count of stored
 * mail are read one account at a time, which is nothing for a few accounts.
 */
@Service
public class AdminQueries {

    private final UserDirectory users;
    private final AccountRoster accounts;
    private final SyncStatuses syncs;
    private final ConversationStats stats;

    AdminQueries(UserDirectory users, AccountRoster accounts, SyncStatuses syncs, ConversationStats stats) {
        this.users = users;
        this.accounts = accounts;
        this.syncs = syncs;
        this.stats = stats;
    }

    /** Every user, oldest first, with how many accounts they have connected (removed ones left out). */
    public List<UserView> users() {
        Map<UUID, Long> accountsPerOwner = accounts.allAccounts().stream()
                .collect(groupingBy(AccountListing::ownerId, counting()));
        return users.allUsers().stream()
                .map(user -> new UserView(user.id(), user.email(), user.displayName(), user.status(),
                        user.createdAt(), accountsPerOwner.getOrDefault(user.id(), 0L)))
                .toList();
    }

    /** Every account that is not removed, of every owner, oldest first. */
    public List<AccountView> accounts() {
        return accounts.allAccounts().stream().map(this::viewOf).toList();
    }

    /** The numbers at a glance; {@code accountsByStatus} always has every status, in the order of the enum. */
    public Overview overview() {
        List<AccountListing> all = accounts.allAccounts();
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (AccountStatus status : AccountStatus.values()) {
            byStatus.put(status.name(), 0L);
        }
        all.forEach(account -> byStatus.merge(account.status().name(), 1L, Long::sum));
        long failing = all.stream().filter(account -> syncs.statusOf(account.id()).failing()).count();
        long stored = all.stream().mapToLong(account -> stats.storedMessages(account.id())).sum();
        return new Overview(users.allUsers().size(), all.size(), byStatus, failing, stored);
    }

    private AccountView viewOf(AccountListing account) {
        AccountSyncStatus sync = syncs.statusOf(account.id());
        return new AccountView(account.id(), account.ownerId(), account.provider().value(), account.address(),
                account.status().name(), account.syncEnabled(), account.createdAt(),
                stats.storedMessages(account.id()), new SyncView(sync.importStatus(), sync.importError(),
                        sync.lastSyncAt(), sync.syncError(), sync.push()));
    }

}
