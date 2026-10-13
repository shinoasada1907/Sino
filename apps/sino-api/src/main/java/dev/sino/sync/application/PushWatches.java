package dev.sino.sync.application;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.event.Level;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountSummary;
import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.PushRegistration;
import dev.sino.sync.SyncStateChanged;
import dev.sino.sync.infrastructure.SyncCheckpoints;

/**
 * Keeps the providers telling Sino of changes to the imported accounts (F07, D-76): a watch is registered when the
 * first import of an account is DONE, and {@link #renewDueWatches()} (every hour, {@link LiveSyncSchedule}) registers
 * again the ones that are missing, failed, or end within {@code sino.sync.live.push-renew-before} (2 days). Only for
 * accounts that sync on their own, with a connector that declares {@code PUSH_WEBHOOK}. A failure is recorded and
 * tried again at the next check; it never stops a sync, which goes on every minute meanwhile. Logs never name the
 * address of a watch.
 */
@Component
public class PushWatches {

    static final String NOT_REGISTERED = "PUSH_NOT_REGISTERED";

    private static final Logger log = LoggerFactory.getLogger(PushWatches.class);

    private final SyncCheckpoints checkpoints;
    private final AccountDirectory directory;
    private final ProviderRegistry providers;
    private final ProviderAccess access;
    private final LiveSyncProperties properties;
    private final ApplicationEventPublisher events;
    // The accounts whose watch is being registered: the worker that just imported one and the hourly check never
    // register the same account at once, so their results are never written out of order.
    private final Set<UUID> registering = ConcurrentHashMap.newKeySet();

    PushWatches(SyncCheckpoints checkpoints, AccountDirectory directory, ProviderRegistry providers,
            ProviderAccess access, LiveSyncProperties properties, ApplicationEventPublisher events) {
        this.checkpoints = checkpoints;
        this.directory = directory;
        this.providers = providers;
        this.access = access;
        this.properties = properties;
        this.events = events;
    }

    public void renewDueWatches() {
        checkpoints.dueForWatch(properties.pushRenewBefore()).forEach(this::watch);
    }

    /**
     * Registers the watch of the account, or renews it, when the account syncs on its own and its connector can;
     * nothing when it is being registered already. Throws nothing but an {@link Error}: a failure is recorded on the
     * account, or only logged when even that fails.
     */
    void watch(UUID accountId) {
        if (!registering.add(accountId)) {
            return;
        }
        try {
            register(accountId);
        } catch (ProviderException failure) {
            failed(accountId, failure.errorCode().name(), null);
        } catch (SinoException failure) {
            // ProviderAccess: the account was removed or turned off meanwhile, or its connector is gone.
            failed(accountId, failure.errorCode().code(), null);
        } catch (RuntimeException failure) {
            failed(accountId, "INTERNAL", failure);
        } finally {
            registering.remove(accountId);
        }
    }

    private void register(UUID accountId) {
        if (directory.byId(accountId).filter(AccountChecks::syncsOnItsOwn).filter(this::canPush).isEmpty()) {
            return;
        }
        Optional<PushRegistration> registration = access.call(accountId,
                (connector, context) -> connector.registerPush(context));
        if (registration.isEmpty()) {
            // The connector declares push but did not register: as good as a failure, and tried again.
            failed(accountId, NOT_REGISTERED, null);
            return;
        }
        checkpoints.watched(accountId, registration.get().address(), registration.get().expiresAt());
        log.info("Account {} is watched until {}", accountId, registration.get().expiresAt());
        events.publishEvent(new SyncStateChanged(accountId, Instant.now()));
    }

    // Asked again every hour: an error is a WARN, with the stack of an unexpected one, only when it is new. A thread
    // stopped because the application closes records nothing, like an import or a sync.
    private void failed(UUID accountId, String errorCode, RuntimeException cause) {
        if (Thread.currentThread().isInterrupted()) {
            log.info("The watch of account {} was not registered: the application is closing", accountId);
            return;
        }
        try {
            boolean newError = checkpoints.watchFailed(accountId, errorCode).orElse(false);
            log.atLevel(newError ? Level.WARN : Level.DEBUG).setCause(cause)
                    .log("The watch of account {} could not be registered: {}", accountId, errorCode);
            if (newError) {
                events.publishEvent(new SyncStateChanged(accountId, Instant.now()));
            }
        } catch (RuntimeException failure) {
            log.atWarn().setCause(cause).log("The watch of account {} could not be registered: {}", accountId,
                    errorCode);
            log.error("The watch of account {}: the failure could not be recorded", accountId, failure);
        }
    }

    private boolean canPush(AccountSummary account) {
        return providers.find(account.provider())
                .filter(connector -> connector.capabilities().supports(ProviderCapability.PUSH_WEBHOOK)).isPresent();
    }

}
