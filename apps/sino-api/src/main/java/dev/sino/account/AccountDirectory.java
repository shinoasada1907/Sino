package dev.sino.account;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import dev.sino.provider.ProviderCapabilities;

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

    /**
     * The account when it is not removed, whoever owns it, whatever its status: for work no request of a user started,
     * such as automatic sync. Requests of a user look accounts up with {@link #find}.
     */
    Optional<AccountSummary> byId(UUID accountId);

    /**
     * What an account read from this directory can do, whatever its status: its connector's capabilities, less sending
     * while it has not granted the scopes to send (F10, D-130). Nothing for a provider without a connector.
     */
    ProviderCapabilities capabilitiesOf(AccountSummary account);

}
