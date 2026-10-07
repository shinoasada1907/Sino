package dev.sino.account.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.AccountStatusChanged;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.domain.StatusChange;
import dev.sino.account.infrastructure.ConnectedAccountRepository;

/**
 * Changes a user makes to one of their own accounts. Every change goes through an action of the aggregate, so the
 * transition table of the F02 design applies, and a real change of status publishes {@link AccountStatusChanged}
 * in the same transaction.
 */
@Service
public class AccountManagementService {

    private final ConnectedAccountRepository accounts;
    private final ApplicationEventPublisher events;

    AccountManagementService(ConnectedAccountRepository accounts, ApplicationEventPublisher events) {
        this.accounts = accounts;
        this.events = events;
    }

    /**
     * Applies the non-null fields of {@code command}. The version check of the account turns a concurrent change
     * into an {@link org.springframework.dao.OptimisticLockingFailureException} when the transaction commits.
     *
     * @return the account after the change
     * @throws dev.sino.common.error.SinoException with {@link AccountErrorCode#ACCOUNT_NOT_FOUND} when the owner
     *         has no account with this ID
     */
    @Transactional
    public ConnectedAccount update(UUID ownerId, UUID accountId, UpdateAccountCommand command) {
        ConnectedAccount account = accounts.findByIdAndOwnerId(accountId, ownerId)
                .orElseThrow(AccountErrorCode::accountNotFound);

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

}
