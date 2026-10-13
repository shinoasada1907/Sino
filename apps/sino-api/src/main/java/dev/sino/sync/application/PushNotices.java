package dev.sino.sync.application;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import dev.sino.account.AccountDirectory;
import dev.sino.provider.ProviderPushReceived;
import dev.sino.provider.ProviderType;
import dev.sino.sync.infrastructure.SyncCheckpoints;

/**
 * A provider's notice of changes (F07, D-76) syncs the accounts watched under its address: only accounts of that
 * provider that sync on their own (not paused, turned off, waiting for a new connection, or removed). The notice is
 * only a signal: the sync reads the changes from the saved cursor, as for any other request, and requests that come
 * while a sync runs make one more pass at most. Logs never name the address.
 */
@Component
public class PushNotices {

    private static final Logger log = LoggerFactory.getLogger(PushNotices.class);

    private final SyncCheckpoints checkpoints;
    private final AccountDirectory directory;
    private final ImportRunner runner;

    PushNotices(SyncCheckpoints checkpoints, AccountDirectory directory, ImportRunner runner) {
        this.checkpoints = checkpoints;
        this.directory = directory;
        this.runner = runner;
    }

    // In the webhook's request: a query and a hand-over, the reading itself runs in the background.
    @EventListener
    void on(ProviderPushReceived notice) {
        List<UUID> accounts = accountsFor(notice.provider(), notice.address());
        if (accounts.isEmpty()) {
            // Expected for a few days after an account is removed: its watch runs until it ends.
            log.info("A {} notice matches no account that syncs on its own", notice.provider());
        }
        accounts.forEach(runner::submit);
    }

    /** The accounts a notice of the provider for this address syncs. */
    public List<UUID> accountsFor(ProviderType provider, String address) {
        return checkpoints.watchedBy(address).stream()
                .filter(accountId -> directory.byId(accountId)
                        .filter(account -> account.provider().equals(provider))
                        .filter(AccountChecks::syncsOnItsOwn).isPresent())
                .toList();
    }

}
