package dev.sino.account;

import java.util.List;

/**
 * Every account of every owner, for the work of the person who runs Sino (admin, D-265). Not for a request of a
 * user: those read the accounts of their owner through {@link AccountDirectory}. Never a credential.
 */
public interface AccountRoster {

    /** The accounts that are not removed, of every owner, whatever their status, oldest first. */
    List<AccountListing> allAccounts();

}
