package dev.sino.conversation.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountSummary;
import dev.sino.conversation.application.InboxMessage.Address;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.spi.MessageDirection;

/**
 * Whether the owner can reply in a conversation from Sino, and who a reply goes to (F10, D-130, D-133). Sending
 * (BE-59) works out the addressees with the same rule, never from what the web sends.
 */
@Service
@Transactional(readOnly = true)
public class Replies {

    private final JdbcClient jdbc;
    private final AccountDirectory directory;
    private final ProviderRegistry providers;

    Replies(JdbcClient jdbc, AccountDirectory directory, ProviderRegistry providers) {
        this.jdbc = jdbc;
        this.directory = directory;
        this.providers = providers;
    }

    /** For a conversation already found in the owner's inbox. */
    public Reply of(UUID ownerId, InboxItem conversation) {
        return new Reply(stateOf(ownerId, conversation), recipientsOf(conversation.id()));
    }

    // In this order: reconnecting cannot help a provider that never sends, and a reconnect also grants the scopes.
    // A paused sync does not matter.
    private ReplyState stateOf(UUID ownerId, InboxItem conversation) {
        boolean providerSends = providers.find(conversation.provider())
                .map(connector -> connector.capabilities().supports(ProviderCapability.SEND_MESSAGES))
                .orElse(false);
        if (!providerSends) {
            return ReplyState.NOT_SUPPORTED;
        }
        Optional<AccountSummary> account = directory.find(ownerId, conversation.accountId());
        AccountStatus status = account.map(AccountSummary::status).orElse(AccountStatus.DISABLED);
        if (status == AccountStatus.AUTH_EXPIRED || status == AccountStatus.DISABLED) {
            return ReplyState.ACCOUNT_UNAVAILABLE;
        }
        return directory.capabilitiesOf(account.orElseThrow()).supports(ProviderCapability.SEND_MESSAGES)
                ? ReplyState.READY : ReplyState.NEEDS_PERMISSION;
    }

    /**
     * D-133: the Reply-To, else the sender, of the newest incoming message; with no incoming message, whom the newest
     * outgoing one went to. A message stored before Sino read addressees has no Reply-To, so it goes to the sender.
     */
    private List<Address> recipientsOf(UUID conversationId) {
        Optional<Newest> incoming = newest(conversationId, MessageDirection.INBOUND);
        if (incoming.isPresent()) {
            Newest message = incoming.get();
            List<Address> replyTo = message.recipients() == null ? null : message.recipients().replyTo();
            if (replyTo != null && !replyTo.isEmpty()) {
                return replyTo;
            }
            return message.sender() == null ? List.of() : List.of(message.sender());
        }
        // A key missing from what the store kept reads as null, like unknown addressees.
        return newest(conversationId, MessageDirection.OUTBOUND)
                .map(message -> message.recipients() == null || message.recipients().to() == null ? List.<Address>of()
                        : message.recipients().to())
                .orElse(List.of());
    }

    private Optional<Newest> newest(UUID conversationId, MessageDirection direction) {
        return jdbc.sql("""
                SELECT m.recipients, p.external_participant_id AS sender, p.display_name AS sender_name
                FROM message m LEFT JOIN conversation_participant p ON p.id = m.sender_participant_id
                WHERE m.conversation_id = :conversation AND m.direction = :direction
                ORDER BY m.sent_at DESC, m.id DESC LIMIT 1
                """).param("conversation", conversationId).param("direction", direction.name())
                .query((row, n) -> {
                    String sender = row.getString("sender");
                    return new Newest(StoredRecipients.parse(row.getString("recipients")),
                            sender == null ? null : new Address(row.getString("sender_name"), sender));
                })
                .optional();
    }

    private record Newest(StoredRecipients recipients, Address sender) {
    }

}
