package dev.sino.account;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * How another module reads the accounts of an owner (F05): which accounts there are, their provider and status,
 * never a credential. A removed account, or an account of another owner, reads exactly like one that does not
 * exist. Read only; the tables of this module stay its own.
 */
public interface AccountDirectory {

    /** The accounts of the owner that are not removed, oldest first, whatever their status. */
    List<AccountSummary> accountsOf(UUID ownerId);

    /** The account when it belongs to the owner and is not removed, whatever its status. */
    Optional<AccountSummary> find(UUID ownerId, UUID accountId);

}
