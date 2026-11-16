package dev.sino.conversation;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * What the one-off catch-up of the mail folders (mail-folders, D-501) needs from the stored mail of an account.
 */
public interface MailboxCatchUp {

    /**
     * The external IDs among {@code externalMessageIds} that no message of the account holds.
     */
    Set<String> notStored(UUID accountId, Collection<String> externalMessageIds);

    /**
     * Gives the stored messages of the account that have no mailbox the one the provider reports: the given IDs are in
     * spam, in trash or archived; of the rest, the mail that came in is in the inbox, and sent mail stays without a
     * mailbox (D-498). A message that already has a mailbox came from a sync that read its labels, which is fresher
     * than any listing, so it is left alone. Works out the summary of the conversations it changed.
     *
     * @return the conversations that changed
     * @throws org.springframework.transaction.IllegalTransactionStateException when no transaction is active
     */
    Set<UUID> apply(UUID accountId, Collection<String> spam, Collection<String> trash, Collection<String> archive);

}
