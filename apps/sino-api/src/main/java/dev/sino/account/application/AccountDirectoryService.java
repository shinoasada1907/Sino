package dev.sino.account.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountSummary;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;

/** {@link AccountDirectory} over the same owner-scoped queries as the account API. */
@Service
@Transactional(readOnly = true)
public class AccountDirectoryService implements AccountDirectory {

    private final ConnectedAccountRepository accounts;

    AccountDirectoryService(ConnectedAccountRepository accounts) {
        this.accounts = accounts;
    }

    @Override
    public List<AccountSummary> accountsOf(UUID ownerId) {
        return accounts.findByOwnerIdAndRemovedAtIsNullOrderByCreatedAtAscIdAsc(ownerId).stream()
                .map(AccountDirectoryService::summaryOf).toList();
    }

    @Override
    public Optional<AccountSummary> find(UUID ownerId, UUID accountId) {
        return accounts.findByIdAndOwnerIdAndRemovedAtIsNull(accountId, ownerId)
                .map(AccountDirectoryService::summaryOf);
    }

    private static AccountSummary summaryOf(ConnectedAccount account) {
        return new AccountSummary(account.id(), account.provider(), account.status(), account.externalAccountId());
    }

}
