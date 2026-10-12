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
     * Sends {@code text} to whom {@link Replies} says a reply goes, never to addressees from the request.
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
            return new Sent(read(conversationId, attempt.messageId()), false);
        }
        SendMessageResult result;
        try {
            result = access.call(conversation.accountId(),
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
        return new Sent(read(conversationId, messageId), true);
    }

    /**
     * Removes a message Sino failed to send; any other message stays.
     *
     * @throws SinoException {@code CONVERSATION_NOT_FOUND}, {@code MESSAGE_NOT_FOUND} or {@code MESSAGE_NOT_DELETABLE}
     */
    public void discard(UUID ownerId, UUID conversationId, UUID messageId) {
        InboxItem conversation = inbox.requireInInbox(ownerId, conversationId);
        transactions.executeWithoutResult(status -> {
            summaries.lock(conversation.accountId());
            Optional<Boolean> failedFromSino = jdbc.sql("""
                    SELECT client_message_id IS NOT NULL AND status = 'FAILED' FROM message
                    WHERE id = :message AND conversation_id = :conversation
                    """).param("message", messageId).param("conversation", conversationId)
                    .query(Boolean.class).optional();
            if (failedFromSino.isEmpty()) {
                throw ConversationErrorCode.messageNotFound();
            }
            if (!failedFromSino.get()) {
                throw ConversationErrorCode.messageNotDeletable();
            }
            jdbc.sql("DELETE FROM message WHERE id = :message").param("message", messageId).update();
            changed(conversation.accountId(), conversationId);
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
    // a minute (a refused token makes ProviderAccess run it again), so PENDING is left alone for five.
    @Override
    public void reconcile(UUID accountId) {
        List<Uncertain> uncertain = jdbc.sql("""
                SELECT m.id, m.conversation_id, m.client_message_id,
                       m.sent_at < now() - interval '10 minutes' AS given_up
                FROM message m JOIN conversation c ON c.id = m.conversation_id
                WHERE c.account_id = :account AND m.client_message_id IS NOT NULL
                  AND (m.status = 'UNKNOWN' OR (m.status = 'PENDING' AND m.sent_at < now() - interval '5 minutes'))
                ORDER BY m.sent_at, m.id
                """).param("account", accountId)
                .query((row, n) -> new Uncertain(row.getObject("id", UUID.class),
                        row.getObject("conversation_id", UUID.class), row.getObject("client_message_id", UUID.class),
                        row.getBoolean("given_up")))
                .list();
        for (Uncertain message : uncertain) {
            Optional<String> found;
            boolean canTell = true;
            try {
                found = access.call(accountId,
                        (connector, context) -> connector.findSentMessage(context, message.clientMessageId()));
            } catch (ProviderException failure) {
                if (failure.errorCode() != ProviderErrorCode.CAPABILITY_NOT_SUPPORTED) {
                    log.warn("Messages of account {} were not checked: {}", accountId, failure.errorCode());
                    return;
                }
                found = Optional.empty();
                canTell = false;
            } catch (SinoException failure) {
                log.warn("Messages of account {} were not checked: {}", accountId, failure.errorCode().code());
                return;
            }
            Optional<String> externalId = found;
            boolean givenUp = canTell && message.givenUp();
            transactions.executeWithoutResult(status -> {
                summaries.lock(accountId);
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

    // Transaction 1: what this clientMessageId already is decides; a new or failed message is written PENDING.
    private Attempt begin(UUID ownerId, InboxItem conversation, String text, UUID clientMessageId) {
        summaries.lock(conversation.accountId());
        Optional<Existing> existing = jdbc.sql("""
                SELECT id, status FROM message WHERE conversation_id = :conversation AND client_message_id = :client
                """).param("conversation", conversation.id()).param("client", clientMessageId)
                .query((row, n) -> new Existing(row.getObject("id", UUID.class),
                        MessageStatus.valueOf(row.getString("status"))))
                .optional();
        if (existing.isPresent()) {
            switch (existing.get().status()) {
                case PENDING -> throw ConversationErrorCode.sendInProgress();
                case UNKNOWN -> throw ConversationErrorCode.sendOutcomeStillUnknown(existing.get().id());
                case FAILED -> {
                    // Certainly not sent before: send it again, below.
                }
                default -> {
                    return Attempt.done(existing.get().id());
                }
            }
        }
        Reply reply = replies.of(ownerId, conversation);
        if (reply.state() != ReplyState.READY) {
            throw ConversationErrorCode.replyNotAllowed(reply.state());
        }
        if (reply.to().isEmpty()) {
            throw ConversationErrorCode.noRecipient();
        }
        String externalConversationId = jdbc.sql("SELECT external_conversation_id FROM conversation WHERE id = :id")
                .param("id", conversation.id()).query(String.class).single();
        // The message it answers is the newest the provider has: not one Sino has yet to send.
        String answered = jdbc.sql("""
                SELECT external_message_id FROM message
                WHERE conversation_id = :conversation AND external_message_id NOT LIKE 'sino:%'
                ORDER BY sent_at DESC, id DESC LIMIT 1
                """).param("conversation", conversation.id()).query(String.class).optional().orElse(null);
        List<NormalizedRecipients.Address> to = reply.to().stream()
                .map(address -> new NormalizedRecipients.Address(address.name(), address.address())).toList();
        String recipients = JSON.writeValueAsString(new NormalizedRecipients(to, List.of(), List.of()));
        UUID messageId = existing.isPresent() ? resend(existing.get().id(), text, answered, recipients)
                : write(conversation.id(), clientMessageId, text, answered, recipients);
        changed(conversation.accountId(), conversation.id());
        return new Attempt(messageId, conversation.accountId(), conversation.id(), clientMessageId,
                new SendMessageCommand(externalConversationId, text, answered, to, clientMessageId), false);
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
            jdbc.sql("UPDATE message SET client_message_id = :client, updated_at = now() WHERE id = :message")
                    .param("client", clientMessageId).param("message", imported.get()).update();
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

    private record Existing(UUID id, MessageStatus status) {
    }

    private record Uncertain(UUID id, UUID conversationId, UUID clientMessageId, boolean givenUp) {
    }

    private record Attempt(UUID messageId, UUID accountId, UUID conversationId, UUID clientMessageId,
            SendMessageCommand command, boolean alreadySent) {

        static Attempt done(UUID messageId) {
            return new Attempt(messageId, null, null, null, null, true);
        }

    }

}
