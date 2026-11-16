package dev.sino.account.application;

import java.net.URI;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.AccountRemoved;
import dev.sino.account.AccountStatusChanged;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.domain.StatusChange;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.account.infrastructure.oauth.OAuth2TokenRevoker;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderCredentials;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Changes a user makes to one of their own accounts. Every change goes through an action of the aggregate, so the
 * transition table of the F02 design applies, and every change publishes its event in the same transaction.
 */
@Service
public class AccountManagementService {

    private static final Logger LOG = LoggerFactory.getLogger(AccountManagementService.class);

    private final ConnectedAccountRepository accounts;
    private final CredentialStore credentials;
    private final ApplicationEventPublisher events;
    private final ProviderRegistry providers;
    private final OAuth2TokenRevoker revoker;
    private final TransactionTemplate transaction;

    AccountManagementService(ConnectedAccountRepository accounts, CredentialStore credentials,
            ApplicationEventPublisher events, ProviderRegistry providers, OAuth2TokenRevoker revoker,
            PlatformTransactionManager transactionManager) {
        this.accounts = accounts;
        this.credentials = credentials;
        this.events = events;
        this.providers = providers;
        this.revoker = revoker;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /**
     * Applies the non-null fields of {@code command}; a real change of status publishes {@link AccountStatusChanged}.
     * Disabling an account also asks its connector to drop any live session once the transaction commits (D-284).
     * The version check of the account turns a concurrent change into an
     * {@link org.springframework.dao.OptimisticLockingFailureException} when the transaction commits.
     *
     * @return the account after the change
     * @throws dev.sino.common.error.SinoException with {@link AccountErrorCode#ACCOUNT_NOT_FOUND} when the owner
     *         has no account with this ID, or it was removed
     */
    @Transactional
    public ConnectedAccount update(UUID ownerId, UUID accountId, UpdateAccountCommand command) {
        ConnectedAccount account = findOwned(ownerId, accountId);

        if (command.displayName() != null) {
            account.rename(command.displayName());
        }
        if (command.syncEnabled() != null) {
            if (command.syncEnabled()) {
                account.resumeSync();
            } else {
                account.pauseSync();
            }
        }
        if (command.enabled() != null) {
            Optional<StatusChange> change = command.enabled() ? account.enable() : account.disable();
            change.ifPresent(c -> {
                events.publishEvent(new AccountStatusChanged(account.id(), c.from(), c.to(), Instant.now()));
                if (!command.enabled()) {
                    disconnectAfterCommit(account.provider(), contextOf(account));
                }
            });
        }
        return account;
    }

    /**
     * Removes the account (D-13 B): marks the row as removed, deletes its credential and publishes
     * {@link AccountRemoved}, all in one transaction. Once that transaction is committed, asks the provider to drop
     * Sino's grant (F04a) and any live session (D-284), outside any transaction and best effort: a failure there only
     * leaves a warning. Call it outside a transaction, or the provider would hear of the removal before it is
     * committed.
     *
     * @throws dev.sino.common.error.SinoException with {@link AccountErrorCode#ACCOUNT_NOT_FOUND} when the owner
     *         has no account with this ID, or it was already removed
     */
    public void remove(UUID ownerId, UUID accountId) {
        // A rollback throws here, so nothing is revoked or disconnected for a removal that did not happen.
        Removed removed = transaction.execute(status -> removeInTransaction(ownerId, accountId));
        if (removed != null) {
            removed.revocation().ifPresent(grant -> revoker.revoke(grant.provider(), accountId, grant.revocationUri(),
                    grant.refreshToken()));
            disconnect(removed.provider(), removed.context());
        }
    }

    private Removed removeInTransaction(UUID ownerId, UUID accountId) {
        ConnectedAccount account = findOwned(ownerId, accountId);
        // Read before the credential is deleted: the provider needs it once the row is gone.
        Optional<Revocation> revocation = revocationUriOf(account.provider()).flatMap(uri -> credentials
                .refreshToken(account.id()).map(token -> new Revocation(account.provider(), uri, token)));
        ProviderContext context = contextOf(account);
        Instant now = Instant.now();

        account.remove(now);
        credentials.delete(account.id());
        events.publishEvent(new AccountRemoved(account.id(), account.ownerId(), account.provider(), now));
        return new Removed(account.provider(), context, revocation);
    }

    private ProviderContext contextOf(ConnectedAccount account) {
        ProviderCredentials stored = credentials.load(account.id()).orElseGet(() -> new TokenCredentials("-"));
        return new ProviderContext(account.id(), account.externalAccountId(), stored);
    }

    private void disconnectAfterCommit(ProviderType provider, ProviderContext context) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {

                @Override
                public void afterCommit() {
                    disconnect(provider, context);
                }

            });
        } else {
            disconnect(provider, context);
        }
    }

    private void disconnect(ProviderType provider, ProviderContext context) {
        providers.find(provider).ifPresent(connector -> {
            try {
                connector.disconnect(context);
            } catch (ProviderException failure) {
                LOG.warn("Disconnecting account {} from {} failed ({})", context.accountId(), provider,
                        failure.errorCode());
            } catch (RuntimeException failure) {
                LOG.warn("Disconnecting account {} from {} failed: {}", context.accountId(), provider,
                        failure.getClass().getSimpleName());
            }
        });
    }

    // Empty when the connector is gone, does not connect over OAuth2, or the provider has no revocation address.
    private Optional<URI> revocationUriOf(ProviderType provider) {
        return providers.find(provider).flatMap(MessageProvider::oauth2).map(OAuth2Connection::revocationUri);
    }

    private ConnectedAccount findOwned(UUID ownerId, UUID accountId) {
        return accounts.findByIdAndOwnerIdAndRemovedAtIsNull(accountId, ownerId)
                .orElseThrow(AccountErrorCode::accountNotFound);
    }

    /** What to send the provider once the removal is committed. */
    private record Removed(ProviderType provider, ProviderContext context, Optional<Revocation> revocation) {
    }

    private record Revocation(ProviderType provider, URI revocationUri, String refreshToken) {

        @Override
        public String toString() {
            return "Revocation[provider=" + provider + ", revocationUri=" + revocationUri + ", refreshToken=****]";
        }

    }

}
