package dev.sino.sync;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * A page of mail of the account was stored (F08), published in the transaction that stored it: the conversations it
 * touched and how many inbound messages are new. {@code live} for a sync after the first import, false during the
 * import. IDs and counts only, never the content of mail.
 */
public record MailStored(UUID accountId, Set<UUID> conversationIds, int newInbound, boolean live, Instant storedAt) {

    public MailStored {
        Objects.requireNonNull(accountId, "accountId must not be null");
        conversationIds = Set.copyOf(conversationIds);
        Objects.requireNonNull(storedAt, "storedAt must not be null");
    }

}
