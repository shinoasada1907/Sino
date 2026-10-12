package dev.sino.conversation;

import java.util.UUID;

/**
 * What became of the messages sent from Sino whose outcome is not known (F10, D-132). The {@code sync} module calls
 * {@link #reconcile} after each sync of an account, and {@link #reconcileAll} on a schedule of its own, so a paused
 * or failing sync does not leave a send unsettled. Call both outside a transaction: they ask the provider.
 */
public interface SentMessages {

    /**
     * Asks the provider about each message of the account whose send got no answer, and about each one a send left
     * {@code PENDING} for more than five minutes: found, it is {@code SENT}; not found ten minutes after it was sent,
     * it is {@code FAILED} and can be sent again, unless the connector cannot tell, when it stays unknown; otherwise
     * it stays unknown for the next try. A provider that fails leaves them as they are.
     */
    void reconcile(UUID accountId);

    /**
     * {@link #reconcile} for every account with such a message, except one the user turned off or that must be
     * connected again: its provider would refuse anyway.
     */
    void reconcileAll();

}
