package dev.sino.account.application;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.common.error.SinoException;

/**
 * Reads the accounts of one owner. Every method takes the owner, so no read can forget to filter by it, and an
 * account of another owner is reported exactly like one that does not exist.
 */
@Service
@Transactional(readOnly = true)
public class AccountQueryService {

    private final ConnectedAccountRepository accounts;

    AccountQueryService(ConnectedAccountRepository accounts) {
        this.accounts = accounts;
    }

    /** Oldest first. */
    public List<ConnectedAccount> list(UUID ownerId) {
        return accounts.findByOwnerIdOrderByCreatedAtAscIdAsc(ownerId);
    }

    /**
     * @throws SinoException with {@link AccountErrorCode#ACCOUNT_NOT_FOUND} when the owner has no account with
     *         this ID
     */
    public ConnectedAccount get(UUID ownerId, UUID accountId) {
        return accounts.findByIdAndOwnerId(accountId, ownerId)
                .orElseThrow(() -> new SinoException(AccountErrorCode.ACCOUNT_NOT_FOUND, "Account not found."));
    }

}
