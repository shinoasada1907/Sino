package dev.sino.account.application;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.AccountListing;
import dev.sino.account.AccountRoster;
import dev.sino.account.infrastructure.ConnectedAccountRepository;

/** {@link AccountRoster} over the account table; removed accounts (D-13 B) are left out. */
@Service
@Transactional(readOnly = true)
public class AccountRosterService implements AccountRoster {

    private final ConnectedAccountRepository accounts;

    AccountRosterService(ConnectedAccountRepository accounts) {
        this.accounts = accounts;
    }

    @Override
    public List<AccountListing> allAccounts() {
        return accounts.findByRemovedAtIsNullOrderByCreatedAtAscIdAsc().stream()
                .map(account -> new AccountListing(account.id(), account.ownerId(), account.provider(),
                        account.status(), account.address(), account.syncEnabled(), account.createdAt()))
                .toList();
    }

}
