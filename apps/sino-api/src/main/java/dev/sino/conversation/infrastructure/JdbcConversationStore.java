package dev.sino.conversation.infrastructure;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.StoreResult;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.SyncBatch;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@link ConversationStore} in plain SQL (F05 design, section 2). Every write is an
 * {@code INSERT ... ON CONFLICT} on the external ID, so two syncs storing the same mail at once cannot make a copy,
 * and its {@code DO UPDATE ... WHERE} leaves a row that would not change untouched (02B section 11).
 */
@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class JdbcConversationStore implements ConversationStore {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JdbcClient jdbc;
    private final ConversationSummaries summaries;

    JdbcConversationStore(JdbcClient jdbc, ConversationSummaries summaries) {
        this.jdbc = jdbc;
        this.summaries = summaries;
    }

    @Override
    public StoreResult store(UUID accountId, SyncBatch page) {
        summaries.lock(accountId);
        SyncBatch batch = WithoutNul.of(page);
        Map<String, StoredConversation> conversations = storeConversations(accountId, batch);
        Map<Participant, UUID> participants = storeParticipants(batch, conversations);
        int created = 0;
        int updated = 0;
        int createdInbound = 0;
        Set<UUID> unarchived = new LinkedHashSet<>();
        for (NormalizedMessage message : batch.messages()) {
            StoredConversation conversation = conversations.get(message.externalConversationId());
            UUID senderId = message.senderExternalParticipantId() == null ? null
                    : participants.get(new Participant(conversation.id(), message.senderExternalParticipantId()));
            StoredMessage stored = storeMessage(conversation.id(), senderId, message);
            boolean filesChanged = storeFiles(stored.id(), message.attachments());
            if (stored.change() == Change.INSERTED) {
                created++;
                if (message.direction() == MessageDirection.INBOUND) {
                    createdInbound++;
                }
                // New mail from someone else brings an archived conversation back; an answer of the account does not.
                if (message.direction() == MessageDirection.INBOUND
                        && message.sentAt().isAfter(conversation.lastMessageAt())) {
                    unarchived.add(conversation.id());
                }
            } else if (stored.change() == Change.UPDATED || filesChanged) {
                updated++;
            }
        }
        List<UUID> touched = conversations.values().stream().map(StoredConversation::id).toList();
        summaries.summarize(touched);
        unarchive(unarchived);
        return new StoreResult(created, updated, Set.copyOf(touched), createdInbound);
    }

    // Step 1. A conversation the batch names but does not describe gets a minimal row that never overwrites one.
    private Map<String, StoredConversation> storeConversations(UUID accountId, SyncBatch batch) {
        Map<String, Instant> newest = newestMessageTimes(batch.messages());
        Set<String> externalIds = new LinkedHashSet<>();
        for (NormalizedConversation conversation : batch.conversations()) {
            externalIds.add(conversation.externalConversationId());
            Instant lastMessageAt = Optional.ofNullable(newest.get(conversation.externalConversationId()))
                    .or(() -> Optional.ofNullable(conversation.lastActivityAt())).orElse(Instant.EPOCH);
            // A known type is never lowered to UNKNOWN. The title follows the page only when the page has mail newer
            // than any stored (or there is no title yet): a page of changes to old mail carries an old title.
            jdbc.sql("""
                    INSERT INTO conversation AS c (account_id, external_conversation_id, type, title, avatar_url,
                                                   last_message_at, created_at, updated_at)
                    VALUES (:account, :externalId, :type, :title, :avatarUrl, :lastMessageAt, now(), now())
                    ON CONFLICT (account_id, external_conversation_id) DO UPDATE
                    SET type = COALESCE(NULLIF(EXCLUDED.type, 'UNKNOWN'), c.type),
                        title = CASE WHEN cast(:newest AS timestamptz) > c.last_message_at
                                     THEN COALESCE(EXCLUDED.title, c.title)
                                     ELSE COALESCE(c.title, EXCLUDED.title) END,
                        avatar_url = COALESCE(EXCLUDED.avatar_url, c.avatar_url),
                        updated_at = now()
                    WHERE (c.type, c.title, c.avatar_url) IS DISTINCT FROM
                          (COALESCE(NULLIF(EXCLUDED.type, 'UNKNOWN'), c.type),
                           CASE WHEN cast(:newest AS timestamptz) > c.last_message_at
                                THEN COALESCE(EXCLUDED.title, c.title)
                                ELSE COALESCE(c.title, EXCLUDED.title) END,
                           COALESCE(EXCLUDED.avatar_url, c.avatar_url))
                    """)
                    .param("account", accountId).param("externalId", conversation.externalConversationId())
                    .param("type", conversation.type().name()).param("title", conversation.title())
                    .param("avatarUrl", conversation.avatarUrl()).param("lastMessageAt", at(lastMessageAt))
                    .param("newest", Optional.ofNullable(newest.get(conversation.externalConversationId()))
                            .map(JdbcConversationStore::at).orElse(null))
                    .update();
        }
        for (Map.Entry<String, Instant> conversation : newest.entrySet()) {
            if (externalIds.add(conversation.getKey())) {
                jdbc.sql("""
                        INSERT INTO conversation (account_id, external_conversation_id, type, last_message_at,
                                                  created_at, updated_at)
                        VALUES (:account, :externalId, :type, :lastMessageAt, now(), now())
                        ON CONFLICT (account_id, external_conversation_id) DO NOTHING
                        """)
                        .param("account", accountId).param("externalId", conversation.getKey())
                        .param("type", ConversationType.UNKNOWN.name())
                        .param("lastMessageAt", at(conversation.getValue())).update();
            }
        }
        if (externalIds.isEmpty()) {
            return Map.of();
        }
        // last_message_at is still the one from before this page: step 5 works it out again.
        return jdbc.sql("""
                SELECT external_conversation_id, id, last_message_at FROM conversation
                WHERE account_id = :account AND external_conversation_id IN (:externalIds)
                """)
                .param("account", accountId).param("externalIds", externalIds)
                .query((row, n) -> Map.entry(row.getString(1), new StoredConversation(row.getObject(2, UUID.class),
                        row.getObject(3, OffsetDateTime.class).toInstant())))
                .stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    // Step 2. A name or picture is kept when a later page leaves it out; once self, always self.
    private Map<Participant, UUID> storeParticipants(SyncBatch batch, Map<String, StoredConversation> conversations) {
        for (NormalizedConversation conversation : batch.conversations()) {
            UUID conversationId = conversations.get(conversation.externalConversationId()).id();
            for (NormalizedParticipant participant : conversation.participants()) {
                jdbc.sql("""
                        INSERT INTO conversation_participant AS p (conversation_id, external_participant_id,
                                                                   display_name, avatar_url, is_self)
                        VALUES (:conversation, :externalId, :name, :avatarUrl, :self)
                        ON CONFLICT (conversation_id, external_participant_id) DO UPDATE
                        SET display_name = COALESCE(EXCLUDED.display_name, p.display_name),
                            avatar_url = COALESCE(EXCLUDED.avatar_url, p.avatar_url),
                            is_self = p.is_self OR EXCLUDED.is_self
                        WHERE (p.display_name, p.avatar_url, p.is_self) IS DISTINCT FROM
                              (COALESCE(EXCLUDED.display_name, p.display_name),
                               COALESCE(EXCLUDED.avatar_url, p.avatar_url), p.is_self OR EXCLUDED.is_self)
                        """)
                        .param("conversation", conversationId)
                        .param("externalId", participant.externalParticipantId())
                        .param("name", participant.displayName()).param("avatarUrl", participant.avatarUrl())
                        .param("self", participant.self()).update();
            }
        }
        // A sender the connector did not list is known by its ID only.
        for (NormalizedMessage message : batch.messages()) {
            if (message.senderExternalParticipantId() != null) {
                jdbc.sql("""
                        INSERT INTO conversation_participant (conversation_id, external_participant_id)
                        VALUES (:conversation, :externalId)
                        ON CONFLICT (conversation_id, external_participant_id) DO NOTHING
                        """)
                        .param("conversation", conversations.get(message.externalConversationId()).id())
                        .param("externalId", message.senderExternalParticipantId()).update();
            }
        }
        if (conversations.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("""
                SELECT conversation_id, external_participant_id, id FROM conversation_participant
                WHERE conversation_id IN (:conversations)
                """)
                .param("conversations", conversations.values().stream().map(StoredConversation::id).toList())
                .query((row, n) -> Map.entry(new Participant(row.getObject(1, UUID.class), row.getString(2)),
                        row.getObject(3, UUID.class)))
                .stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    // Step 3. Read state (D-67): is_read is what Sino shows, provider_read what the provider said last. When the provider
    // changes its mind, Sino follows; when it says the same again, a choice made in Sino stays. Addressees the
    // connector cannot tell (null) keep those stored, and are no change for that alone (F06).
    private StoredMessage storeMessage(UUID conversationId, UUID senderId, NormalizedMessage message) {
        Optional<StoredMessage> written = jdbc.sql("""
                INSERT INTO message AS m (conversation_id, sender_participant_id, external_message_id, direction, type,
                                          text_content, status, sent_at, reply_to_external_message_id, is_read,
                                          provider_read, metadata, recipients, created_at, updated_at)
                VALUES (:conversation, :sender, :externalId, :direction, :type, :text, :status, :sentAt, :replyTo,
                        :read, :read, cast(:metadata AS jsonb), cast(:recipients AS jsonb), now(), now())
                ON CONFLICT (conversation_id, external_message_id) DO UPDATE
                SET sender_participant_id = EXCLUDED.sender_participant_id,
                    direction = EXCLUDED.direction,
                    type = EXCLUDED.type,
                    text_content = EXCLUDED.text_content,
                    status = EXCLUDED.status,
                    sent_at = EXCLUDED.sent_at,
                    reply_to_external_message_id = EXCLUDED.reply_to_external_message_id,
                    metadata = EXCLUDED.metadata,
                    recipients = coalesce(EXCLUDED.recipients, m.recipients),
                    is_read = CASE WHEN m.provider_read IS DISTINCT FROM EXCLUDED.provider_read
                                   THEN EXCLUDED.provider_read ELSE m.is_read END,
                    provider_read = EXCLUDED.provider_read,
                    updated_at = now()
                WHERE (m.sender_participant_id, m.direction, m.type, m.text_content, m.status, m.sent_at,
                       m.reply_to_external_message_id, m.metadata, m.recipients, m.provider_read)
                      IS DISTINCT FROM
                      (EXCLUDED.sender_participant_id, EXCLUDED.direction, EXCLUDED.type, EXCLUDED.text_content,
                       EXCLUDED.status, EXCLUDED.sent_at, EXCLUDED.reply_to_external_message_id, EXCLUDED.metadata,
                       coalesce(EXCLUDED.recipients, m.recipients), EXCLUDED.provider_read)
                RETURNING id, xmax = 0
                """)
                .param("conversation", conversationId).param("sender", senderId)
                .param("externalId", message.externalMessageId()).param("direction", message.direction().name())
                .param("type", message.type().name()).param("text", message.textContent())
                .param("status", message.status().name()).param("sentAt", at(message.sentAt()))
                .param("replyTo", message.replyToExternalMessageId()).param("read", message.read())
                .param("metadata", JSON.writeValueAsString(message.metadata()))
                .param("recipients", message.recipients() == null ? null
                        : JSON.writeValueAsString(message.recipients()))
                // xmax is 0 for a row this statement inserted, and set for one it updated.
                .query((row, n) -> new StoredMessage(row.getObject(1, UUID.class),
                        row.getBoolean(2) ? Change.INSERTED : Change.UPDATED))
                .optional();
        return written.orElseGet(() -> new StoredMessage(jdbc.sql("""
                SELECT id FROM message WHERE conversation_id = :conversation AND external_message_id = :externalId
                """).param("conversation", conversationId).param("externalId", message.externalMessageId())
                .query(UUID.class).single(), Change.NONE));
    }

    // Step 4. Whether any file of the message was added, changed or removed.
    private boolean storeFiles(UUID messageId, List<NormalizedAttachment> files) {
        int changed = 0;
        for (NormalizedAttachment file : files) {
            changed += jdbc.sql("""
                    INSERT INTO attachment AS a (message_id, external_attachment_id, file_name, mime_type, size_bytes,
                                                 remote_url, thumbnail_url)
                    VALUES (:message, :externalId, :fileName, :mimeType, :size, :remoteUrl, :thumbnailUrl)
                    ON CONFLICT (message_id, external_attachment_id) DO UPDATE
                    SET file_name = EXCLUDED.file_name,
                        mime_type = EXCLUDED.mime_type,
                        size_bytes = EXCLUDED.size_bytes,
                        remote_url = EXCLUDED.remote_url,
                        thumbnail_url = EXCLUDED.thumbnail_url
                    WHERE (a.file_name, a.mime_type, a.size_bytes, a.remote_url, a.thumbnail_url) IS DISTINCT FROM
                          (EXCLUDED.file_name, EXCLUDED.mime_type, EXCLUDED.size_bytes, EXCLUDED.remote_url,
                           EXCLUDED.thumbnail_url)
                    """)
                    .param("message", messageId).param("externalId", file.externalAttachmentId())
                    .param("fileName", file.fileName()).param("mimeType", file.mimeType())
                    .param("size", file.sizeBytes()).param("remoteUrl", file.remoteUrl())
                    .param("thumbnailUrl", file.thumbnailUrl()).update();
        }
        List<String> kept = files.stream().map(NormalizedAttachment::externalAttachmentId).toList();
        changed += kept.isEmpty()
                ? jdbc.sql("DELETE FROM attachment WHERE message_id = :message").param("message", messageId).update()
                : jdbc.sql("DELETE FROM attachment WHERE message_id = :message AND external_attachment_id NOT IN (:kept)")
                        .param("message", messageId).param("kept", kept).update();
        return changed > 0;
    }

    private void unarchive(Set<UUID> conversations) {
        if (!conversations.isEmpty()) {
            jdbc.sql("UPDATE conversation SET archived = false, updated_at = now() WHERE id IN (:ids) AND archived")
                    .param("ids", conversations).update();
        }
    }

    private static Map<String, Instant> newestMessageTimes(List<NormalizedMessage> messages) {
        Map<String, Instant> newest = new LinkedHashMap<>();
        for (NormalizedMessage message : messages) {
            newest.merge(message.externalConversationId(), message.sentAt(),
                    (known, other) -> known.isAfter(other) ? known : other);
        }
        return newest;
    }

    private static OffsetDateTime at(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    private record StoredConversation(UUID id, Instant lastMessageAt) {
    }

    private record Participant(UUID conversationId, String externalId) {
    }

    private record StoredMessage(UUID id, Change change) {
    }

    private enum Change {
        INSERTED, UPDATED, NONE
    }

}
