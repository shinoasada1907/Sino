package dev.sino.conversation.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountSummary;
import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.SentMessages;
import dev.sino.conversation.infrastructure.ConversationSummaries;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.NormalizedRecipients;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SendMessageResult;
import tools.jackson.databind.json.JsonMapper;

/**
 * Replies from Sino (F10, D-131…D-133). A message is written {@code PENDING} before the provider hears of it, the
 * provider is called outside any transaction, and what came of it is written after; the same
 * {@code clientMessageId} never sends twice. A send that got no answer is settled later by asking the provider
 * ({@link SentMessages}, D-132). Every write takes the lock of the account that the store takes too, so a sync that
 * brings the sent message in meanwhile is seen.
 */
@Service
public class ReplyService implements SentMessages {

    /** The provider's ID of a message Sino has not sent yet is not known: this prefix and the clientMessageId. */
    static final String UNSENT = "sino:";

    private static final Logger log = LoggerFactory.getLogger(ReplyService.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JdbcClient jdbc;
    private final InboxService inbox;
    private final Replies replies;
    private final MessageHistory history;
    private final ConversationSummaries summaries;
    private final ProviderAccess access;
    private final AccountDirectory directory;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;

    ReplyService(JdbcClient jdbc, InboxService inbox, Replies replies, MessageHistory history,
            ConversationSummaries summaries, ProviderAccess access, AccountDirectory directory,
            TransactionTemplate transactions, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.inbox = inbox;
        this.replies = replies;
        this.history = history;
        this.summaries = summaries;
        this.access = access;
        this.directory = directory;
        this.transactions = transactions;
        this.events = events;
    }

    /**
     * Sends {@code text} to whom {@link Replies} says a reply goes, never to addressees from the request. A thread found
     * in several accounts of the owner replies from its primary copy, in its thread, and keeps the message there (F05b,
     * D-186).
     *
     * @return the message; {@code created} is false when this {@code clientMessageId} was already sent
     * @throws SinoException {@code CONVERSATION_NOT_FOUND}, {@code SEND_IN_PROGRESS}, {@code SEND_OUTCOME_UNKNOWN}
     *         (409 for a message already in that state, 504 when this send got no answer), {@code REPLY_NOT_ALLOWED},
     *         {@code REPLY_NO_RECIPIENT} or {@code SEND_FAILED}
     */
    public Sent send(UUID ownerId, UUID conversationId, String text, UUID clientMessageId) {
        InboxItem conversation = inbox.requireInInbox(ownerId, conversationId);
        Attempt attempt = transactions.execute(status -> begin(ownerId, conversation, text, clientMessageId));
        if (attempt.alreadySent()) {
            return new Sent(read(attempt.conversationId(), attempt.messageId()), false);
        }
        SendMessageResult result;
        try {
            result = access.call(attempt.accountId(),
                    (connector, context) -> connector.sendMessage(context, attempt.command()));
        } catch (ProviderException failure) {
            throw failed(attempt, failure);
        } catch (SinoException failure) {
            // The account was removed or turned off, or its connector is gone: nothing was sent.
            end(attempt, MessageStatus.FAILED);
            throw failure;
        } catch (RuntimeException failure) {
            // Not a failure the provider reported: whether the message went is not known.
            end(attempt, MessageStatus.UNKNOWN);
            throw failure;
        }
        UUID messageId = transactions.execute(status -> sent(attempt, result.externalMessageId()));
        return new Sent(read(attempt.conversationId(), messageId), true);
    }

    /**
     * Removes a message Sino failed to send, in any copy of the thread (F05b); any other message stays.
     *
     * @throws SinoException {@code CONVERSATION_NOT_FOUND}, {@code MESSAGE_NOT_FOUND} or {@code MESSAGE_NOT_DELETABLE}
     */
    public void discard(UUID ownerId, UUID conversationId, UUID messageId) {
        InboxItem conversation = inbox.requireInInbox(ownerId, conversationId);
        transactions.executeWithoutResult(status -> {
            summaries.lockAll(conversation.accountIds());
            Optional<Discardable> found = jdbc.sql("""
                    SELECT conversation_id, client_message_id IS NOT NULL AND status = 'FAILED' AS failed_from_sino
                    FROM message WHERE id = :message AND conversation_id IN (:copies)
                    """).param("message", messageId).param("copies", conversation.conversationIds())
                    .query((row, n) -> new Discardable(row.getObject("conversation_id", UUID.class),
                            row.getBoolean("failed_from_sino")))
                    .optional();
            if (found.isEmpty()) {
                throw ConversationErrorCode.messageNotFound();
            }
            if (!found.get().failedFromSino()) {
                throw ConversationErrorCode.messageNotDeletable();
            }
            jdbc.sql("DELETE FROM message WHERE id = :message").param("message", messageId).update();
            changed(conversation.accountOf(found.get().copy()), found.get().copy());
        });
    }

    @Override
    public void reconcileAll() {
        List<UUID> accounts = jdbc.sql("""
                SELECT DISTINCT c.account_id
                FROM message m JOIN conversation c ON c.id = m.conversation_id
                WHERE m.client_message_id IS NOT NULL AND (m.status = 'UNKNOWN' OR (m.status = 'PENDING'
                      AND m.sent_at < now() - interval '5 minutes'))
                """).query(UUID.class).list();
        for (UUID accountId : accounts) {
            boolean usable = directory.byId(accountId).map(AccountSummary::status)
                    .filter(status -> status != AccountStatus.DISABLED && status != AccountStatus.AUTH_EXPIRED)
                    .isPresent();
            if (usable) {
                reconcile(accountId);
            }
        }
    }

    // Oldest first. A provider that cannot be asked now is not asked again until the next try. A send can take over
    // a minute (a refused token makes ProviderAccess run it again), so PENDING is left alone for five. The provider
    // gets the message as it was sent, less the sender's name it does not need, and when that send started, sent_at
    // (D-132).
    @Override
    public void reconcile(UUID accountId) {
        List<Uncertain> uncertain = jdbc.sql("""
                SELECT m.id, m.conversation_id, m.client_message_id, c.external_conversation_id, m.text_content,
                       m.reply_to_external_message_id, m.recipients, m.sent_at,
                       m.sent_at < now() - interval '10 minutes' AS given_up
                FROM message m JOIN conversation c ON c.id = m.conversation_id
                WHERE c.account_id = :account AND m.client_message_id IS NOT NULL
                  AND (m.status = 'UNKNOWN' OR (m.status = 'PENDING' AND m.sent_at < now() - interval '5 minutes'))
                ORDER BY m.sent_at, m.id
                """).param("account", accountId)
                .query((row, n) -> new Uncertain(row.getObject("id", UUID.class),
                        row.getObject("conversation_id", UUID.class), row.getObject("client_message_id", UUID.class),
                        row.getBoolean("given_up"),
                        new SendMessageCommand(row.getString("external_conversation_id"),
                                row.getString("text_content"), row.getString("reply_to_external_message_id"),
                                addresseesOf(row.getString("recipients")),
                                row.getObject("client_message_id", UUID.class), null),
                        row.getTimestamp("sent_at").toInstant()))
                .list();
        for (Uncertain message : uncertain) {
            List<String> found;
            boolean canTell = true;
            try {
                found = access.call(accountId,
                        (connector, context) -> connector.findSentMessages(context, message.command(),
                                message.startedAt()));
            } catch (ProviderException failure) {
                if (failure.errorCode() != ProviderErrorCode.CAPABILITY_NOT_SUPPORTED) {
                    log.warn("Messages of account {} were not checked: {}", accountId, failure.errorCode());
                    return;
                }
                found = List.of();
                canTell = false;
            } catch (SinoException failure) {
                log.warn("Messages of account {} were not checked: {}", accountId, failure.errorCode().code());
                return;
            }
            List<String> candidates = found;
            boolean givenUp = canTell && message.givenUp();
            transactions.executeWithoutResult(status -> {
                summaries.lock(accountId);
                Optional<String> externalId = candidates.stream()
                        .filter(candidate -> !heldByAnother(message.conversationId(), candidate))
                        .findFirst();
                if (externalId.isPresent()) {
                    confirm(accountId, message.conversationId(), message.id(), message.clientMessageId(),
                            externalId.get());
                } else {
                    settle(accountId, message, givenUp);
                }
            });
        }
    }

    // Not found yet: still unknown, or failed once it is ten minutes old, so the user can send it again; never failed
    // when the connector cannot tell, since sending again could send it twice.
    private void settle(UUID accountId, Uncertain message, boolean givenUp) {
        MessageStatus status = givenUp ? MessageStatus.FAILED : MessageStatus.UNKNOWN;
        int changed = jdbc.sql("""
                UPDATE message SET status = :status, updated_at = now()
                WHERE id = :message AND status IN ('UNKNOWN', 'PENDING') AND status <> :status
                """).param("status", status.name()).param("message", message.id()).update();
        if (changed > 0) {
            changed(accountId, message.conversationId());
        }
    }

    // The same text sent twice matches both messages: one another message of Sino holds is not this one's. A message
    // being settled holds none yet, so any message of Sino that holds it is another.
    private boolean heldByAnother(UUID conversationId, String externalMessageId) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM message
                               WHERE conversation_id = :conversation AND external_message_id = :external
                                 AND client_message_id IS NOT NULL)
                """).param("conversation", conversationId).param("external", externalMessageId)
                .query(Boolean.class).single();
    }

    private static List<NormalizedRecipients.Address> addresseesOf(String recipients) {
        StoredRecipients stored = StoredRecipients.parse(recipients);
        return stored == null || stored.to() == null ? List.of() : stored.to().stream()
                .map(address -> new NormalizedRecipients.Address(address.name(), address.address())).toList();
    }

    // Transaction 1: what this clientMessageId already is decides; a new or failed message is written PENDING. A new
    // one goes in the primary copy (D-186). One sent before with it stays in the copy it was written to, even when
    // another copy has become the primary one since, so it is never sent twice nor from two accounts (D-131).
    private Attempt begin(UUID ownerId, InboxItem conversation, String text, UUID clientMessageId) {
        summaries.lockAll(conversation.accountIds());
        // Every copy of the group, those of accounts out of the inbox too.
        Optional<Existing> existing = jdbc.sql("""
                SELECT m.id, m.conversation_id, m.status FROM message m
                JOIN conversation c ON c.id = m.conversation_id
                WHERE c.thread_group_id = (SELECT thread_group_id FROM conversation WHERE id = :primary)
                  AND m.client_message_id = :client
                """).param("primary", conversation.primaryId()).param("client", clientMessageId)
                .query((row, n) -> new Existing(row.getObject("id", UUID.class),
                        row.getObject("conversation_id", UUID.class), MessageStatus.valueOf(row.getString("status"))))
                .optional();
        if (existing.isPresent() && !conversation.conversationIds().contains(existing.get().conversationId())) {
            // Its account left the inbox: sent from another account, it could go twice.
            throw ConversationErrorCode.replyNotAllowed(ReplyState.ACCOUNT_UNAVAILABLE);
        }
        UUID copy = existing.map(Existing::conversationId).orElse(conversation.primaryId());
        UUID accountId = conversation.accountOf(copy);
        if (existing.isPresent()) {
            switch (existing.get().status()) {
                case PENDING -> throw ConversationErrorCode.sendInProgress();
                case UNKNOWN -> throw ConversationErrorCode.sendOutcomeStillUnknown(existing.get().id());
                case FAILED -> {
                    // Certainly not sent before: send it again, below.
                }
                default -> {
                    return Attempt.done(existing.get().id(), copy);
                }
            }
        }
        Reply reply = replies.of(ownerId, conversation, copy);
        if (reply.state() != ReplyState.READY) {
            throw ConversationErrorCode.replyNotAllowed(reply.state());
        }
        if (reply.to().isEmpty()) {
            throw ConversationErrorCode.noRecipient();
        }
        String externalConversationId = jdbc.sql("SELECT external_conversation_id FROM conversation WHERE id = :id")
                .param("id", copy).query(String.class).single();
        // The message it answers is the newest the provider has: not one Sino has yet to send.
        String answered = jdbc.sql("""
                SELECT external_message_id FROM message
                WHERE conversation_id = :conversation AND external_message_id NOT LIKE 'sino:%'
                ORDER BY sent_at DESC, id DESC LIMIT 1
                """).param("conversation", copy).query(String.class).optional().orElse(null);
        // The name the account wrote in the latest mail it sent itself; Sino writes none of its own (BE-62).
        String senderName = jdbc.sql("""
                SELECT p.display_name FROM message m
                JOIN conversation c ON c.id = m.conversation_id
                JOIN conversation_participant p ON p.id = m.sender_participant_id
                WHERE c.account_id = :account AND m.direction = 'OUTBOUND' AND m.client_message_id IS NULL
                  AND btrim(p.display_name) <> ''
                ORDER BY m.sent_at DESC, m.id DESC LIMIT 1
                """).param("account", accountId).query(String.class).optional().orElse(null);
        List<NormalizedRecipients.Address> to = reply.to().stream()
                .map(address -> new NormalizedRecipients.Address(address.name(), address.address())).toList();
        String recipients = JSON.writeValueAsString(new NormalizedRecipients(to, List.of(), List.of()));
        UUID messageId = existing.isPresent() ? resend(existing.get().id(), text, answered, recipients)
                : write(copy, clientMessageId, text, answered, recipients);
        changed(accountId, copy);
        return new Attempt(messageId, accountId, copy, clientMessageId,
                new SendMessageCommand(externalConversationId, text, answered, to, clientMessageId, senderName),
                false);
    }

    private UUID write(UUID conversationId, UUID clientMessageId, String text, String answered, String recipients) {
        return jdbc.sql("""
                INSERT INTO message (conversation_id, sender_participant_id, external_message_id, direction, type,
                                     text_content, status, sent_at, reply_to_external_message_id, is_read,
                                     provider_read, metadata, recipients, body_format, client_message_id,
                                     created_at, updated_at)
                VALUES (:conversation,
                        (SELECT id FROM conversation_participant
                         WHERE conversation_id = :conversation AND is_self ORDER BY id LIMIT 1),
                        :external, 'OUTBOUND', 'TEXT', :text, 'PENDING', now(), :answered, true, true, '{}',
                        cast(:recipients AS jsonb), 'TEXT', :client, now(), now())
                RETURNING id
                """).param("conversation", conversationId).param("external", UNSENT + clientMessageId)
                .param("text", text).param("answered", answered).param("recipients", recipients)
                .param("client", clientMessageId).query(UUID.class).single();
    }

    // Under the lock, so no other request sends it meanwhile; should another have taken it all the same, the row is
    // no longer FAILED and this request does not send it too.
    private UUID resend(UUID messageId, String text, String answered, String recipients) {
        int taken = jdbc.sql("""
                UPDATE message SET status = 'PENDING', text_content = :text, reply_to_external_message_id = :answered,
                                   recipients = cast(:recipients AS jsonb), sent_at = now(), updated_at = now()
                WHERE id = :message AND status = 'FAILED'
                """).param("text", text).param("answered", answered).param("recipients", recipients)
                .param("message", messageId).update();
        if (taken == 0) {
            throw ConversationErrorCode.sendInProgress();
        }
        return messageId;
    }

    // Transaction 2. When a sync brought the sent message in first, that row stays and takes the clientMessageId.
    private UUID sent(Attempt attempt, String externalMessageId) {
        summaries.lock(attempt.accountId());
        return confirm(attempt.accountId(), attempt.conversationId(), attempt.messageId(), attempt.clientMessageId(),
                externalMessageId);
    }

    // SENT under the provider's ID. When a sync brought the message in first, that row stays and takes the
    // clientMessageId, and the one Sino wrote goes: one message either way.
    private UUID confirm(UUID accountId, UUID conversationId, UUID messageId, UUID clientMessageId,
            String externalMessageId) {
        Optional<UUID> imported = jdbc.sql("""
                SELECT id FROM message WHERE conversation_id = :conversation AND external_message_id = :external
                """).param("conversation", conversationId).param("external", externalMessageId)
                .query(UUID.class).optional();
        UUID confirmed = messageId;
        if (imported.isPresent() && !imported.get().equals(messageId)) {
            jdbc.sql("DELETE FROM message WHERE id = :message").param("message", messageId).update();
            int taken = jdbc.sql("""
                    UPDATE message SET client_message_id = :client, updated_at = now()
                    WHERE id = :message AND (client_message_id IS NULL OR client_message_id = :client)
                    """).param("client", clientMessageId).param("message", imported.get()).update();
            if (taken == 0) {
                // The transaction rolls the delete back: never take what another message of Sino holds.
                throw new IllegalStateException("Message " + externalMessageId + " is held by another message of Sino");
            }
            confirmed = imported.get();
        } else {
            jdbc.sql("""
                    UPDATE message SET external_message_id = :external, status = 'SENT', updated_at = now()
                    WHERE id = :message
                    """).param("external", externalMessageId).param("message", messageId).update();
        }
        changed(accountId, conversationId);
        return confirmed;
    }

    private SinoException failed(Attempt attempt, ProviderException failure) {
        log.warn("Message {} was not sent: {}", attempt.messageId(), failure.errorCode());
        if (failure.errorCode() == ProviderErrorCode.OUTCOME_UNKNOWN) {
            end(attempt, MessageStatus.UNKNOWN);
            return ConversationErrorCode.sendOutcomeUnknown(attempt.messageId());
        }
        end(attempt, MessageStatus.FAILED);
        // ProviderAccess has moved the account to AUTH_EXPIRED: reconnecting is what helps.
        if (failure.errorCode() == ProviderErrorCode.AUTH_EXPIRED) {
            return ConversationErrorCode.replyNotAllowed(ReplyState.ACCOUNT_UNAVAILABLE);
        }
        return ConversationErrorCode.sendFailed(attempt.messageId());
    }

    private void end(Attempt attempt, MessageStatus status) {
        transactions.executeWithoutResult(transaction -> {
            summaries.lock(attempt.accountId());
            jdbc.sql("""
                    UPDATE message SET status = :status, updated_at = now() WHERE id = :message AND status = 'PENDING'
                    """).param("status", status.name()).param("message", attempt.messageId()).update();
            changed(attempt.accountId(), attempt.conversationId());
        });
    }

    private void changed(UUID accountId, UUID conversationId) {
        summaries.summarize(List.of(conversationId));
        events.publishEvent(new ConversationChanged(accountId, conversationId, Instant.now()));
    }

    private InboxMessage read(UUID conversationId, UUID messageId) {
        return history.message(conversationId, messageId).orElseThrow(ConversationErrorCode::messageNotFound);
    }

    /** A message sent from Sino, as the list of messages shows it; {@code created} unless it was sent before. */
    public record Sent(InboxMessage message, boolean created) {
    }

    private record Existing(UUID id, UUID conversationId, MessageStatus status) {
    }

    private record Discardable(UUID copy, boolean failedFromSino) {
    }

    private record Uncertain(UUID id, UUID conversationId, UUID clientMessageId, boolean givenUp,
            SendMessageCommand command, Instant startedAt) {
    }

    private record Attempt(UUID messageId, UUID accountId, UUID conversationId, UUID clientMessageId,
            SendMessageCommand command, boolean alreadySent) {

        static Attempt done(UUID messageId, UUID conversationId) {
            return new Attempt(messageId, null, conversationId, null, null, true);
        }

    }

}
