package dev.sino.sync.application;

import java.util.UUID;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountSummary;

/**
 * The checks every request of the sync API starts with, the same way as the account API answers, and which accounts
 * are kept up to date on their own.
 */
final class AccountChecks {

    private AccountChecks() {
    }

    /** The account of the owner, not removed; otherwise {@code ACCOUNT_NOT_FOUND}, like the account API. */
    static AccountSummary requireAccount(AccountDirectory directory, UUID ownerId, UUID accountId) {
        return directory.find(ownerId, accountId).orElseThrow(SyncErrorCode::accountNotFound);
    }

    /** D-12: an account the user turned off is not read at all. */
    static void requireEnabled(AccountSummary account) {
        if (account.status() == AccountStatus.DISABLED) {
            throw SyncErrorCode.accountDisabled();
        }
    }

    /**
     * Automatic sync and watches are for an account the user did not pause or turn off, and that needs no new
     * connection.
     */
    static boolean syncsOnItsOwn(AccountSummary account) {
        return account.syncEnabled() && account.status() != AccountStatus.DISABLED
                && account.status() != AccountStatus.AUTH_EXPIRED;
    }

}
