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
import dev.sino.provider.ProviderCapabilities;

/**
 * {@link AccountDirectory} over the same owner-scoped queries as the account API, and, for work in the background,
 * one lookup by ID across owners.
 */
@Service
@Transactional(readOnly = true)
public class AccountDirectoryService implements AccountDirectory {

    private final ConnectedAccountRepository accounts;
    private final AccountCapabilities capabilities;

    AccountDirectoryService(ConnectedAccountRepository accounts, AccountCapabilities capabilities) {
        this.accounts = accounts;
        this.capabilities = capabilities;
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

    @Override
    public Optional<AccountSummary> byId(UUID accountId) {
        return accounts.findByIdAndRemovedAtIsNull(accountId).map(AccountDirectoryService::summaryOf);
    }

    @Override
    public ProviderCapabilities capabilitiesOf(AccountSummary account) {
        return capabilities.of(account.id(), account.provider());
    }

    private static AccountSummary summaryOf(ConnectedAccount account) {
        return new AccountSummary(account.id(), account.ownerId(), account.provider(), account.status(),
                account.externalAccountId(), account.syncEnabled());
    }

}
