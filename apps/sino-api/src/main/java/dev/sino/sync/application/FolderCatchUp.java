package dev.sino.sync.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.MailboxCatchUp;
import dev.sino.conversation.StoreResult;
import dev.sino.provider.spi.MailboxListing;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.sync.MailStored;
import dev.sino.sync.infrastructure.SyncCheckpoints;
import dev.sino.sync.infrastructure.SyncCheckpoints.FoldersSince;

/**
 * The one-off catch-up of the mail folders of an imported account (mail-folders, D-501): mail stored before Sino read
 * mailboxes gets its mailbox from the provider's lists, and spam and trash the import never listed is read and stored.
 * Runs in the background, one account per thread, apart from normal sync; one account failing leaves the others alone
 * and is tried again at the next start. {@code folders_caught_up_at} of the account's checkpoint is the mark that it
 * ran, set in the transaction that applies the lists. Never announces new mail and never brings an archived
 * conversation back: what it stores is not inbox mail. Logs name accounts and counts, never mail.
 */
@Component
public class FolderCatchUp implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(FolderCatchUp.class);
    // The size of a sync page: messages are read one by one, so a page is also a transaction.
    private static final int PAGE = 50;

    private final ProviderAccess access;
    private final ConversationStore store;
    private final MailboxCatchUp mailboxes;
    private final SyncCheckpoints checkpoints;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;
    private final boolean enabled;
    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("folder-catch-up-", 0).factory());
    private final Set<UUID> running = ConcurrentHashMap.newKeySet();

    FolderCatchUp(ProviderAccess access, ConversationStore store, MailboxCatchUp mailboxes,
            SyncCheckpoints checkpoints, TransactionTemplate transactions, ApplicationEventPublisher events,
            @Value("${sino.sync.folders.catch-up:true}") boolean enabled) {
        this.access = access;
        this.store = store;
        this.mailboxes = mailboxes;
        this.checkpoints = checkpoints;
        this.transactions = transactions;
        this.events = events;
        this.enabled = enabled;
    }

    /** At the start: every imported account that has not caught up, each in the background. */
    @EventListener(ApplicationReadyEvent.class)
    public void submitPending() {
        if (!enabled) {
            return;
        }
        List<UUID> pending = checkpoints.awaitingFolders();
        if (!pending.isEmpty()) {
            log.info("Folder catch-up runs for {} accounts", pending.size());
        }
        pending.forEach(this::submit);
    }

    /** Runs the catch-up of the account in the background; nothing when it is switched off or already running. */
    void submit(UUID accountId) {
        if (!enabled || !running.add(accountId)) {
            return;
        }
        try {
            executor.execute(() -> {
                try {
                    run(accountId);
                } finally {
                    running.remove(accountId);
                }
            });
        } catch (RejectedExecutionException closing) {
            running.remove(accountId);
        }
    }

    @Override
    public void destroy() {
        executor.shutdownNow();
    }

    /**
     * Catches the account up now, on this thread: nothing when it is not imported or has already. A failure is logged
     * and leaves the account unmarked.
     *
     * @return whether the account is caught up
     */
    public boolean run(UUID accountId) {
        try {
            FoldersSince awaited = checkpoints.foldersAwaited(accountId).orElse(null);
            if (awaited == null) {
                return false;
            }
            Instant since = awaited.since();
            MailboxListing listing = access.call(accountId, (connector, context) -> connector.listMailboxes(context,
                    since)).orElse(null);
            if (listing == null) {
                // A provider without folders: nothing to catch up, and nothing to ask again at every start.
                transactions.executeWithoutResult(status -> checkpoints.foldersCaughtUp(accountId));
                return true;
            }
            readMissing(accountId, listing, since);
            int[] changed = new int[1];
            transactions.executeWithoutResult(status -> {
                Set<UUID> conversations = mailboxes.apply(accountId, listing.spam(), listing.trash(),
                        listing.archive());
                checkpoints.foldersCaughtUp(accountId);
                changed[0] = conversations.size();
                if (!conversations.isEmpty()) {
                    events.publishEvent(new MailStored(accountId, conversations, 0, false, Instant.now()));
                }
            });
            log.info("Folder catch-up of account {} is done: {} spam, {} trash, {} archived listed, {} conversations "
                    + "changed", accountId, listing.spam().size(), listing.trash().size(), listing.archive().size(),
                    changed[0]);
            return true;
        } catch (SinoException unavailable) {
            // Removed or turned off: nothing to catch up now; a turned-on account is picked up at the next start.
            log.info("Folder catch-up of account {} skipped: {}", accountId, unavailable.errorCode().code());
        } catch (ProviderException failure) {
            log.warn("Folder catch-up of account {} failed: {}", accountId, failure.errorCode());
        } catch (RuntimeException failure) {
            if (Thread.currentThread().isInterrupted()) {
                log.info("Folder catch-up of account {} stopped", accountId);
            } else {
                log.error("Folder catch-up of account {} failed", accountId, failure);
            }
        }
        return false;
    }

    // Spam and trash the import never listed: stored like a sync page, which gives them their mailbox.
    private void readMissing(UUID accountId, MailboxListing listing, Instant since) {
        List<String> missing = new ArrayList<>(mailboxes.notStored(accountId,
                Stream.concat(listing.spam().stream(), listing.trash().stream()).distinct().toList()));
        for (int from = 0; from < missing.size(); from += PAGE) {
            List<String> ids = missing.subList(from, Math.min(from + PAGE, missing.size()));
            SyncBatch batch = access.call(accountId, (connector, context) -> connector.fetchMessages(context, ids,
                    since));
            transactions.executeWithoutResult(status -> {
                StoreResult stored = store.store(accountId, batch);
                if (stored.newMessages() + stored.updatedMessages() > 0) {
                    // Not inbox mail, so nothing is new (newInbound 0); and it is no sync (live false).
                    events.publishEvent(new MailStored(accountId, stored.conversationIds(), 0, false, Instant.now()));
                }
            });
            if (!batch.skipped().isEmpty()) {
                log.warn("Folder catch-up of account {} skipped {}", accountId, batch.skipped().stream()
                        .map(item -> item.externalId() + " (" + item.reason() + ")").collect(Collectors.joining(", ")));
            }
        }
    }

}
