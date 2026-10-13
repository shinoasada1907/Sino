package dev.sino.conversation.application;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
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

import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.infrastructure.JdbcConversationStore;
import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.ProviderException;

/**
 * The full content of one message (F06, D-120, D-122): its HTML cleaned for the web. A message stored before Sino kept
 * HTML is read again from its provider the first time it is opened; the provider is called outside any transaction,
 * and what it gave is kept in a short one. Logs name messages and error codes, never mail.
 */
@Service
public class MessageBodies {

    private static final Logger log = LoggerFactory.getLogger(MessageBodies.class);

    private final JdbcClient jdbc;
    private final InboxService inbox;
    private final ProviderAccess access;
    private final JdbcConversationStore store;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;

    MessageBodies(JdbcClient jdbc, InboxService inbox, ProviderAccess access, JdbcConversationStore store,
            TransactionTemplate transactions, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.inbox = inbox;
        this.access = access;
        this.store = store;
        this.transactions = transactions;
        this.events = events;
    }

    /**
     * @throws SinoException with {@code CONVERSATION_NOT_FOUND} when the conversation is not in the inbox,
     *         {@code MESSAGE_NOT_FOUND} when the message is not one of it, {@code MESSAGE_CONTENT_UNAVAILABLE} when a
     *         message stored before cannot be read again now (it stays {@code UNCHECKED} for the next try)
     */
    public MessageBody body(UUID ownerId, UUID conversationId, UUID messageId) {
        UUID accountId = inbox.requireInInbox(ownerId, conversationId).accountId();
        Stored stored = find(conversationId, messageId).orElseThrow(ConversationErrorCode::messageNotFound);
        if (stored.format() == BodyFormat.UNCHECKED) {
            stored = readAgain(accountId, conversationId, messageId, stored.externalId());
        }
        if (stored.html() == null) {
            return new MessageBody(BodyFormat.TEXT, null, false);
        }
        Map<String, UUID> pictures = picturesOf(messageId);
        // Relative, so the picture comes from Sino's own origin, the one the web's frame lets pictures come from.
        String files = "/api/conversations/" + conversationId + "/messages/" + messageId + "/attachments/";
        MailHtml.Clean clean = MailHtml.clean(stored.html(),
                contentId -> pictureOf(pictures, contentId).map(picture -> files + picture + "?inline=true"));
        return new MessageBody(BodyFormat.HTML, clean.html(), clean.remoteImages());
    }

    private Map<String, UUID> picturesOf(UUID messageId) {
        Map<String, UUID> pictures = new HashMap<>();
        jdbc.sql("""
                SELECT content_id, id FROM attachment WHERE message_id = :message AND content_id IS NOT NULL ORDER BY id
                """).param("message", messageId)
                .query(row -> {
                    pictures.putIfAbsent(row.getString(1), row.getObject(2, UUID.class));
                });
        return pictures;
    }

    // A cid: URL may escape characters as %XX (RFC 2392), though an id may hold a "%" of its own, and a sender may
    // write the id in another case: as written first, then decoded, then in any case.
    private static Optional<UUID> pictureOf(Map<String, UUID> pictures, String cid) {
        String decoded = withoutEscapes(cid);
        return Optional.ofNullable(pictures.get(cid)).or(() -> Optional.ofNullable(pictures.get(decoded)))
                .or(() -> pictures.entrySet().stream()
                        .filter(picture -> picture.getKey().equalsIgnoreCase(cid)
                                || picture.getKey().equalsIgnoreCase(decoded))
                        .map(Map.Entry::getValue).findFirst());
    }

    private static String withoutEscapes(String cid) {
        if (cid.indexOf('%') < 0) {
            return cid;
        }
        try {
            return URLDecoder.decode(cid.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException broken) {
            return cid;
        }
    }

    // Another request may read the same message meanwhile: the second write changes nothing, and both show what is
    // stored. A provider that cannot read it again, or no longer has it, leaves the text.
    private Stored readAgain(UUID accountId, UUID conversationId, UUID messageId, String externalId) {
        MessageContent content;
        try {
            content = access.call(accountId, (connector, context) -> connector.fetchMessageContent(context,
                    externalId)).orElse(new MessageContent(null, null, List.of()));
        } catch (ProviderException failure) {
            log.warn("Message {} could not be read again: {}", messageId, failure.errorCode());
            throw ConversationErrorCode.contentUnavailable();
        } catch (SinoException failure) {
            log.warn("Message {} could not be read again: {}", messageId, failure.errorCode().code());
            throw ConversationErrorCode.contentUnavailable();
        }
        transactions.executeWithoutResult(status -> {
            // The list now has the addressees and the format: the tabs of the user read it again.
            if (store.storeContent(messageId, content)) {
                events.publishEvent(new ConversationChanged(accountId, conversationId, Instant.now()));
            }
        });
        return find(conversationId, messageId).orElseThrow(ConversationErrorCode::messageNotFound);
    }

    private Optional<Stored> find(UUID conversationId, UUID messageId) {
        return jdbc.sql("""
                SELECT external_message_id, body_format, html_content FROM message
                WHERE id = :id AND conversation_id = :conversation
                """).param("id", messageId).param("conversation", conversationId)
                .query((row, n) -> new Stored(row.getString(1), BodyFormat.valueOf(row.getString(2)),
                        row.getString(3)))
                .optional();
    }

    private record Stored(String externalId, BodyFormat format, String html) {
    }

}
