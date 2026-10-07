package dev.sino.account.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.AccountRemoved;
import dev.sino.account.AccountStatusChanged;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.domain.StatusChange;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;

/**
 * Changes a user makes to one of their own accounts. Every change goes through an action of the aggregate, so the
 * transition table of the F02 design applies, and every change publishes its event in the same transaction.
 */
@Service
public class AccountManagementService {

    private final ConnectedAccountRepository accounts;
    private final CredentialStore credentials;
    private final ApplicationEventPublisher events;

    AccountManagementService(ConnectedAccountRepository accounts, CredentialStore credentials,
            ApplicationEventPublisher events) {
        this.accounts = accounts;
        this.credentials = credentials;
        this.events = events;
    }

    /**
     * Applies the non-null fields of {@code command}; a real change of status publishes {@link AccountStatusChanged}.
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
            change.ifPresent(c -> events.publishEvent(
                    new AccountStatusChanged(account.id(), c.from(), c.to(), Instant.now())));
        }
        return account;
    }

    /**
     * Removes the account (D-13 B): marks the row as removed, deletes its credential and publishes
     * {@link AccountRemoved}, all in one transaction.
     *
     * @throws dev.sino.common.error.SinoException with {@link AccountErrorCode#ACCOUNT_NOT_FOUND} when the owner
     *         has no account with this ID, or it was already removed
     */
    @Transactional
    public void remove(UUID ownerId, UUID accountId) {
        ConnectedAccount account = findOwned(ownerId, accountId);
        Instant now = Instant.now();

        account.remove(now);
        credentials.delete(account.id());
        events.publishEvent(new AccountRemoved(account.id(), account.ownerId(), account.provider(), now));
    }

    private ConnectedAccount findOwned(UUID ownerId, UUID accountId) {
        return accounts.findByIdAndOwnerIdAndRemovedAtIsNull(accountId, ownerId)
                .orElseThrow(AccountErrorCode::accountNotFound);
    }

}
