package dev.sino.conversation.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
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
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedRecipients;
import dev.sino.provider.spi.OutgoingFile;
import dev.sino.provider.spi.OutgoingImage;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SendMessageResult;
import dev.sino.sticker.StickerPictures;
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

    /** The text a sticker Sino sent is stored with, as a photo of Zalo is stored as {@code [Ảnh]}. */
    static final String STICKER_TEXT = "[Sticker]";

    /** The text a picture from the computer is stored with (zalo-send-files, D-373), as a photo of Zalo is. */
    static final String PICTURE_TEXT = "[Ảnh]";

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
    private final StickerPictures stickers;

    ReplyService(JdbcClient jdbc, InboxService inbox, Replies replies, MessageHistory history,
            ConversationSummaries summaries, ProviderAccess access, AccountDirectory directory,
            TransactionTemplate transactions, ApplicationEventPublisher events, StickerPictures stickers) {
        this.jdbc = jdbc;
        this.inbox = inbox;
        this.replies = replies;
        this.history = history;
        this.summaries = summaries;
        this.access = access;
        this.directory = directory;
        this.transactions = transactions;
        this.events = events;
        this.stickers = stickers;
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
        return send(ownerId, conversationId, new Text(text), clientMessageId);
    }

    /**
     * Sends a sticker of the owner's library as a picture (ZS-05, D-351), with every guarantee of a text: one send for a
     * {@code clientMessageId}, a retry of a message that went out answers it even if the sticker has been deleted
     * since, and an outcome that is not known is settled later. The message is stored as an {@code IMAGE} that names its
     * sticker, so the web shows it from the library (D-352).
     *
     * @return the message; {@code created} is false when this {@code clientMessageId} was already sent
     * @throws SinoException the ones of {@link #send}, and {@code STICKER_NOT_FOUND} for a sticker that is not the
     *         owner's, {@code STICKER_NOT_SENDABLE} for one a message cannot carry, and {@code REPLY_NOT_ALLOWED} with
     *         the state {@code NOT_SUPPORTED} where the connector sends no pictures
     */
    public Sent sendSticker(UUID ownerId, UUID conversationId, UUID stickerId, UUID clientMessageId) {
        return send(ownerId, conversationId, new Sticker(stickerId), clientMessageId);
    }

    /**
     * Sends a picture or a file from the user's computer (zalo-send-files, D-370), with every guarantee of a text. The
     * bytes are not kept: the message is stored as an {@code IMAGE} ({@code [Ảnh]}) or a {@code FILE} (its name) with
     * one attachment that names the file, its type and size (D-373); a retry of one that went out answers it without
     * sending again.
     *
     * @return the message; {@code created} is false when this {@code clientMessageId} was already sent
     * @throws SinoException the ones of {@link #send}, and {@code REPLY_NOT_ALLOWED} with the state
     *         {@code NOT_SUPPORTED} where the connector or the account sends no files
     */
    public Sent sendFile(UUID ownerId, UUID conversationId, OutgoingFile file, UUID clientMessageId) {
        return send(ownerId, conversationId, new Upload(file), clientMessageId);
    }

    private Sent send(UUID ownerId, UUID conversationId, Outgoing outgoing, UUID clientMessageId) {
        InboxItem conversation = inbox.requireInInbox(ownerId, conversationId);
        Attempt attempt = transactions.execute(status -> begin(ownerId, conversation, outgoing, clientMessageId));
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
                SELECT m.id, m.conversation_id, m.client_message_id, c.external_conversation_id, c.type, m.text_content,
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
                                ConversationType.valueOf(row.getString("type")),
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
                if (failure.errorCode() != ProviderErrorCode.CAPABILITY_NOT_SUPPORTED
                        && failure.errorCode() != ProviderErrorCode.OUTCOME_UNKNOWN) {
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
    private Attempt begin(UUID ownerId, InboxItem conversation, Outgoing outgoing, UUID clientMessageId) {
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
        if (outgoing instanceof Sticker && !reply.canSendImages()) {
            // The connector of this conversation sends text only (D-356): nothing is written or sent.
            throw ConversationErrorCode.replyNotAllowed(ReplyState.NOT_SUPPORTED);
        }
        if (outgoing instanceof Upload && !reply.canSendFiles()) {
            // The same for a file from the computer (zalo-send-files, D-372).
            throw ConversationErrorCode.replyNotAllowed(ReplyState.NOT_SUPPORTED);
        }
        if (reply.to().isEmpty()) {
            throw ConversationErrorCode.noRecipient();
        }
        ConversationTarget target = jdbc.sql("""
                SELECT external_conversation_id, type FROM conversation WHERE id = :id
                """).param("id", copy)
                .query((row, n) -> new ConversationTarget(row.getString("external_conversation_id"),
                        ConversationType.valueOf(row.getString("type"))))
                .single();
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
        // Read only now, after a message already sent has been answered above: a retry of a sticker that went out must
        // not fail because the sticker was deleted since. Nothing is written before it is known to be the owner's.
        OutgoingImage picture = outgoing instanceof Sticker sticker ? pictureOf(ownerId, sticker.id()) : null;
        UUID messageId = existing.isPresent() ? resend(existing.get().id(), outgoing, answered, recipients)
                : write(copy, clientMessageId, outgoing, answered, recipients);
        if (outgoing instanceof Upload upload) {
            name(messageId, clientMessageId, upload.file());
        }
        changed(accountId, copy);
        return new Attempt(messageId, accountId, copy, clientMessageId,
                new SendMessageCommand(target.externalConversationId(), target.type(),
                        outgoing instanceof Text text ? text.text() : null, answered, to, clientMessageId, senderName,
                        picture, outgoing instanceof Upload upload ? upload.file() : null),
                false);
    }

    private OutgoingImage pictureOf(UUID ownerId, UUID stickerId) {
        return stickers.forOwner(ownerId, stickerId).map(StickerImages::imageOf)
                .orElseThrow(ConversationErrorCode::stickerNotFound);
    }

    private UUID write(UUID conversationId, UUID clientMessageId, Outgoing outgoing, String answered,
            String recipients) {
        return jdbc.sql("""
                INSERT INTO message (conversation_id, sender_participant_id, external_message_id, direction, type,
                                     text_content, status, sent_at, reply_to_external_message_id, is_read,
                                     provider_read, metadata, recipients, body_format, client_message_id,
                                     created_at, updated_at)
                VALUES (:conversation,
                        (SELECT id FROM conversation_participant
                         WHERE conversation_id = :conversation AND is_self ORDER BY id LIMIT 1),
                        :external, 'OUTBOUND', :type, :text, 'PENDING', now(), :answered, true, true,
                        cast(:metadata AS jsonb), cast(:recipients AS jsonb), 'TEXT', :client, now(), now())
                RETURNING id
                """).param("conversation", conversationId).param("external", UNSENT + clientMessageId)
                .param("type", outgoing.type().name()).param("text", outgoing.storedText())
                .param("metadata", outgoing.metadata()).param("answered", answered).param("recipients", recipients)
                .param("client", clientMessageId).query(UUID.class).single();
    }

    // The one attachment of a picture or file Sino sends (D-373): what the bubble names, never its bytes. A resend names it
    // again, the same row.
    private void name(UUID messageId, UUID clientMessageId, OutgoingFile file) {
        jdbc.sql("""
                INSERT INTO attachment (message_id, external_attachment_id, file_name, mime_type, size_bytes)
                VALUES (:message, :external, :name, :type, :size)
                ON CONFLICT (message_id, external_attachment_id)
                DO UPDATE SET file_name = EXCLUDED.file_name, mime_type = EXCLUDED.mime_type,
                              size_bytes = EXCLUDED.size_bytes
                """).param("message", messageId).param("external", UNSENT + clientMessageId)
                .param("name", file.fileName()).param("type", file.mediaType()).param("size", file.size())
                .update();
    }

    // Under the lock, so no other request sends it meanwhile; should another have taken it all the same, the row is
    // no longer FAILED and this request does not send it too.
    private UUID resend(UUID messageId, Outgoing outgoing, String answered, String recipients) {
        int taken = jdbc.sql("""
                UPDATE message SET status = 'PENDING', type = :type, text_content = :text,
                                   reply_to_external_message_id = :answered, metadata = cast(:metadata AS jsonb),
                                   recipients = cast(:recipients AS jsonb), sent_at = now(), updated_at = now()
                WHERE id = :message AND status = 'FAILED'
                """).param("type", outgoing.type().name()).param("text", outgoing.storedText())
                .param("metadata", outgoing.metadata()).param("answered", answered).param("recipients", recipients)
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
            // The message the sync brought in knows nothing of the sticker Sino sent it as: it takes that over (D-352).
            // A list, not a stream: the value is null for every message that is no sticker, and findFirst() refuses null.
            List<String> stickers = jdbc.sql("SELECT metadata ->> :key FROM message WHERE id = :message")
                    .param("key", NormalizedMessage.LIBRARY_STICKER_ID).param("message", messageId)
                    .query((row, n) -> row.getString(1)).list();
            String sticker = stickers.isEmpty() ? null : stickers.get(0);
            jdbc.sql("DELETE FROM message WHERE id = :message").param("message", messageId).update();
            int taken = jdbc.sql("""
                    UPDATE message SET client_message_id = :client,
                                       metadata = CASE WHEN cast(:sticker AS text) IS NULL THEN metadata
                                                       ELSE metadata || jsonb_build_object(cast(:key AS text),
                                                                                           cast(:sticker AS text)) END,
                                       updated_at = now()
                    WHERE id = :message AND (client_message_id IS NULL OR client_message_id = :client)
                    """).param("client", clientMessageId).param("sticker", sticker)
                    .param("key", NormalizedMessage.LIBRARY_STICKER_ID).param("message", imported.get()).update();
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

    private record ConversationTarget(String externalConversationId, ConversationType type) {
    }

    private record Discardable(UUID copy, boolean failedFromSino) {
    }

    private record Uncertain(UUID id, UUID conversationId, UUID clientMessageId, boolean givenUp,
            SendMessageCommand command, Instant startedAt) {
    }

    /** What is sent: a text, a sticker of the library (ZS-05), or a file from the computer (D-373); how each is stored. */
    private sealed interface Outgoing permits Text, Sticker, Upload {

        MessageType type();

        String storedText();

        /** The {@code metadata} of the stored message, as JSON. */
        String metadata();

    }

    private record Text(String text) implements Outgoing {

        @Override
        public MessageType type() {
            return MessageType.TEXT;
        }

        @Override
        public String storedText() {
            return text;
        }

        @Override
        public String metadata() {
            return "{}";
        }

    }

    private record Sticker(UUID id) implements Outgoing {

        @Override
        public MessageType type() {
            return MessageType.IMAGE;
        }

        @Override
        public String storedText() {
            return STICKER_TEXT;
        }

        @Override
        public String metadata() {
            return JSON.writeValueAsString(Map.of(NormalizedMessage.LIBRARY_STICKER_ID, id.toString()));
        }

    }

    private record Upload(OutgoingFile file) implements Outgoing {

        @Override
        public MessageType type() {
            return file.kind() == OutgoingFile.Kind.PHOTO ? MessageType.IMAGE : MessageType.FILE;
        }

        @Override
        public String storedText() {
            return file.kind() == OutgoingFile.Kind.PHOTO ? PICTURE_TEXT : file.fileName();
        }

        @Override
        public String metadata() {
            return "{}";
        }

    }

    private record Attempt(UUID messageId, UUID accountId, UUID conversationId, UUID clientMessageId,
            SendMessageCommand command, boolean alreadySent) {

        static Attempt done(UUID messageId, UUID conversationId) {
            return new Attempt(messageId, null, conversationId, null, null, true);
        }

    }

}
