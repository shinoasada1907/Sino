package dev.sino.realtime.application;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import dev.sino.account.AccountConnected;
import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountRemoved;
import dev.sino.account.AccountStatusChanged;
import dev.sino.account.AccountSummary;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.InboxIds;
import dev.sino.sync.MailStored;
import dev.sino.sync.SyncStateChanged;

/**
 * Tells the browsers of the owner what changed (F08, D-77, spec {@code realtime-events}), only once the change is
 * committed: the owner is found when the event is published, the sending waits for the commit and is dropped on a
 * rollback; an event published outside a transaction is sent at once. Plain listeners, so Spring Modulith's event
 * publication registry, made for listeners that must run again after a failure, keeps nothing for these. The data is
 * IDs, counts and a source, never the content of mail; the web reads what it needs through the API. A conversation is
 * named by the ID the inbox shows for it, that of its group when the thread is in several accounts (F05b, D-189).
 */
@Component
class RealtimeEvents {

    static final String CONVERSATIONS_CHANGED = "conversations.changed";
    static final String ACCOUNT_CHANGED = "account.changed";

    private final EventHub hub;
    private final AccountDirectory directory;
    private final InboxIds inboxIds;

    RealtimeEvents(EventHub hub, AccountDirectory directory, InboxIds inboxIds) {
        this.hub = hub;
        this.directory = directory;
        this.inboxIds = inboxIds;
    }

    @EventListener
    void on(MailStored event) {
        conversationsChanged(event.accountId(), event.conversationIds(), event.newInbound(),
                event.live() ? "sync" : "import", event.storedAt());
    }

    @EventListener
    void on(ConversationChanged event) {
        conversationsChanged(event.accountId(), List.of(event.conversationId()), 0, "user", event.changedAt());
    }

    @EventListener
    void on(SyncStateChanged event) {
        accountChanged(event.accountId(), ownerOf(event.accountId()), event.changedAt());
    }

    @EventListener
    void on(AccountStatusChanged event) {
        accountChanged(event.accountId(), ownerOf(event.accountId()), event.occurredAt());
    }

    @EventListener
    void on(AccountConnected event) {
        accountChanged(event.accountId(), Optional.of(event.ownerId()), event.occurredAt());
    }

    // A removed account is no longer in the directory, so its owner comes with the event.
    @EventListener
    void on(AccountRemoved event) {
        accountChanged(event.accountId(), Optional.of(event.ownerId()), event.occurredAt());
    }

    // The IDs too are read in the publisher's transaction, which may just have joined two copies into one group.
    private void conversationsChanged(UUID accountId, Collection<UUID> conversationIds, int newInbound,
            String source, Instant at) {
        ownerOf(accountId).ifPresent(owner -> {
            ConversationsChange change = new ConversationsChange(accountId, inboxIds.of(owner, conversationIds),
                    newInbound, source, at);
            afterCommit(() -> hub.publish(owner, CONVERSATIONS_CHANGED, change));
        });
    }

    private void accountChanged(UUID accountId, Optional<UUID> owner, Instant at) {
        AccountChange change = new AccountChange(accountId, at);
        owner.ifPresent(found -> afterCommit(() -> hub.publish(found, ACCOUNT_CHANGED, change)));
    }

    // Read in the publisher's transaction, so an account created in it is found.
    private Optional<UUID> ownerOf(UUID accountId) {
        return directory.byId(accountId).map(AccountSummary::ownerId);
    }

    private static void afterCommit(Runnable send) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
    }

    /** The data of {@code conversations.changed}; {@code source} is import, sync or user. */
    record ConversationsChange(String type, UUID accountId, List<UUID> conversationIds, int newInbound, String source,
            Instant at) {

        ConversationsChange(UUID accountId, List<UUID> conversationIds, int newInbound, String source, Instant at) {
            this(CONVERSATIONS_CHANGED, accountId, conversationIds, newInbound, source, at);
        }

    }

    /** The data of {@code account.changed}. */
    record AccountChange(String type, UUID accountId, Instant at) {

        AccountChange(UUID accountId, Instant at) {
            this(ACCOUNT_CHANGED, accountId, at);
        }

    }

}
