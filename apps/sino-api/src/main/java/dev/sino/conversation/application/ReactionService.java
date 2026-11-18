package dev.sino.conversation.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.application.InboxMessage.Reaction;
import dev.sino.conversation.infrastructure.ConversationSummaries;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.ReactCommand;
import dev.sino.provider.spi.ReactionKind;

/**
 * The user's own reaction on a message (zalo-reactions, D-386): checked against the conversation, the message and the
 * connector's set, put on the provider outside any transaction, and stored only once the provider took it. A failure
 * stores nothing; a reaction whose outcome is unknown is not stored either, and the next sync brings it in if Zalo
 * did take it.
 */
@Service
public class ReactionService {

    private static final Logger log = LoggerFactory.getLogger(ReactionService.class);

    private final JdbcClient jdbc;
    private final InboxService inbox;
    private final Replies replies;
    private final MessageHistory history;
    private final ConversationSummaries summaries;
    private final ProviderRegistry providers;
    private final ProviderAccess access;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;

    ReactionService(JdbcClient jdbc, InboxService inbox, Replies replies, MessageHistory history,
            ConversationSummaries summaries, ProviderRegistry providers, ProviderAccess access,
            TransactionTemplate transactions, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.inbox = inbox;
        this.replies = replies;
        this.history = history;
        this.summaries = summaries;
        this.providers = providers;
        this.access = access;
        this.transactions = transactions;
        this.events = events;
    }

    /**
     * Drops {@code code} on a message, replacing the user's earlier reaction, or takes the user's reaction off when
     * {@code code} is null or empty.
     *
     * @return the reactions of the message after it, as {@link MessageHistory} lists them
     * @throws SinoException {@code CONVERSATION_NOT_FOUND}, {@code MESSAGE_NOT_FOUND}, {@code REACTION_NOT_SUPPORTED},
     *         {@code REACTION_UNKNOWN}, {@code REPLY_NOT_ALLOWED}, {@code REACTION_TOO_FAST},
     *         {@code REACTION_OUTCOME_UNKNOWN} or {@code REACTION_FAILED}
     */
    public List<Reaction> react(UUID ownerId, UUID conversationId, UUID messageId, String code) {
        String wanted = code == null ? "" : code;
        InboxItem conversation = inbox.requireInInbox(ownerId, conversationId);
        Target target = jdbc.sql("""
                SELECT m.conversation_id, m.external_message_id, m.metadata::text AS metadata,
                       c.external_conversation_id, c.type
                FROM message m JOIN conversation c ON c.id = m.conversation_id
                WHERE m.id = :message AND m.conversation_id IN (:copies)
                """).param("message", messageId).param("copies", conversation.conversationIds())
                .query((row, n) -> new Target(row.getObject("conversation_id", UUID.class),
                        row.getString("external_message_id"), MessageHistory.metadataOf(row.getString("metadata")),
                        row.getString("external_conversation_id"), ConversationType.valueOf(row.getString("type"))))
                .optional().orElseThrow(ConversationErrorCode::messageNotFound);
        MessageProvider connector = providers.find(conversation.provider()).orElse(null);
        if (connector == null || !connector.capabilities().supports(ProviderCapability.REACTIONS)
                || target.externalMessageId().startsWith(ReplyService.UNSENT)
                || !connector.canReact(target.metadata())) {
            throw ConversationErrorCode.reactionNotSupported();
        }
        if (!wanted.isEmpty() && connector.reactionSet().stream().map(ReactionKind::code)
                .noneMatch(wanted::equals)) {
            throw ConversationErrorCode.reactionUnknown();
        }
        Reply reply = replies.of(ownerId, conversation, target.conversationId());
        if (reply.state() != ReplyState.READY) {
            throw ConversationErrorCode.replyNotAllowed(reply.state());
        }
        UUID accountId = conversation.accountOf(target.conversationId());
        ReactCommand command = new ReactCommand(target.externalConversationId(), target.type(),
                target.externalMessageId(), target.metadata(), wanted);
        String self;
        try {
            self = access.call(accountId, (provider, context) -> {
                provider.react(context, command);
                return context.externalAccountId();
            });
        } catch (ProviderException failure) {
            throw failed(failure);
        }
        transactions.executeWithoutResult(status -> {
            summaries.lock(accountId);
            store(messageId, self, wanted);
            events.publishEvent(new ConversationChanged(accountId, target.conversationId(), Instant.now()));
        });
        return history.reactionsOf(List.of(messageId)).getOrDefault(messageId, List.of());
    }

    // The row of the user stays when the reaction is taken off, without a code, as a reaction brought in by a sync
    // does (RX-06): an older one arriving late cannot bring it back.
    private void store(UUID messageId, String self, String code) {
        jdbc.sql("""
                INSERT INTO message_reaction (message_id, reactor_external_id, reactor_name, is_self, code,
                                              reacted_at, updated_at)
                VALUES (:message, :reactor, NULL, TRUE, :code, now(), now())
                ON CONFLICT (message_id, reactor_external_id)
                DO UPDATE SET code = EXCLUDED.code, is_self = TRUE, reacted_at = EXCLUDED.reacted_at,
                              updated_at = EXCLUDED.updated_at
                """).param("message", messageId).param("reactor", self).param("code", code.isEmpty() ? null : code)
                .update();
    }

    private static SinoException failed(ProviderException failure) {
        log.warn("A reaction was not put: {}", failure.errorCode());
        ProviderErrorCode reason = failure.errorCode();
        if (reason == ProviderErrorCode.OUTCOME_UNKNOWN) {
            return ConversationErrorCode.reactionOutcomeUnknown();
        }
        if (reason == ProviderErrorCode.RATE_LIMITED) {
            return ConversationErrorCode.reactionTooFast();
        }
        if (reason == ProviderErrorCode.AUTH_EXPIRED) {
            // ProviderAccess has moved the account to AUTH_EXPIRED: reconnecting is what helps.
            return ConversationErrorCode.replyNotAllowed(ReplyState.ACCOUNT_UNAVAILABLE);
        }
        if (reason == ProviderErrorCode.CAPABILITY_NOT_SUPPORTED) {
            return ConversationErrorCode.reactionNotSupported();
        }
        return ConversationErrorCode.reactionFailed();
    }

    private record Target(UUID conversationId, String externalMessageId, Map<String, String> metadata,
            String externalConversationId, ConversationType type) {
    }

}
