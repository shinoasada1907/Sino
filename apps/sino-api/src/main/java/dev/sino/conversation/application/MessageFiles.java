package dev.sino.conversation.application;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Semaphore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import dev.sino.account.ProviderAccess;
import dev.sino.common.error.SinoException;
import dev.sino.provider.spi.AttachmentContent;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.ProviderException;

/**
 * The files and embedded pictures of a message, read from the provider each time and never stored (F06, D-125). The
 * provider is called outside any transaction. A file comes whole into memory, so Sino carries files up to
 * {@value #LARGEST_FILE_BYTES} bytes, and reads at most two of the largest downloads, and pictures shown in the mail
 * up to one of the largest, from their providers at once. What is read then stays in memory, once, until it is
 * written out. Logs name attachments and error codes, never content or names.
 */
@Service
public class MessageFiles {

    /** Gmail sends a file whole, base64 in JSON: while it is read, it sits in memory a few times over. */
    static final long LARGEST_FILE_BYTES = 25L * 1024 * 1024;

    private static final Logger log = LoggerFactory.getLogger(MessageFiles.class);

    // One permit a byte, of what is being read from the providers now. Pictures have their own share, so two large
    // downloads never break the pictures of a mail.
    private final Semaphore downloads = new Semaphore((int) (2 * LARGEST_FILE_BYTES));
    private final Semaphore pictures = new Semaphore((int) LARGEST_FILE_BYTES);
    private final JdbcClient jdbc;
    private final InboxService inbox;
    private final ProviderAccess access;

    MessageFiles(JdbcClient jdbc, InboxService inbox, ProviderAccess access) {
        this.jdbc = jdbc;
        this.inbox = inbox;
        this.access = access;
    }

    /**
     * @param inline shown inside the mail: only a PNG, JPEG, GIF or WebP picture
     * @throws SinoException with {@code CONVERSATION_NOT_FOUND} when the conversation is not in the inbox,
     *         {@code ATTACHMENT_NOT_FOUND} when the attachment is not one of that message,
     *         {@code ATTACHMENT_NOT_INLINE} for anything but such a picture asked inline,
     *         {@code ATTACHMENT_TOO_LARGE} beyond {@value #LARGEST_FILE_BYTES} bytes, {@code ATTACHMENT_BUSY} while
     *         other files take what Sino carries at once, and {@code ATTACHMENT_UNAVAILABLE} when the provider cannot
     *         give it now
     */
    public MessageFile file(UUID ownerId, UUID conversationId, UUID messageId, UUID attachmentId, boolean inline) {
        UUID accountId = inbox.requireInInbox(ownerId, conversationId).accountId();
        Stored file = find(conversationId, messageId, attachmentId)
                .orElseThrow(ConversationErrorCode::attachmentNotFound);
        if (inline && !NormalizedAttachment.isPicture(file.mimeType())) {
            throw ConversationErrorCode.attachmentNotInline();
        }
        if (file.sizeBytes() != null && file.sizeBytes() > LARGEST_FILE_BYTES) {
            throw ConversationErrorCode.attachmentTooLarge();
        }
        // A file of unknown size counts as the largest. The permits come back once the provider has answered: from
        // then on only the content itself is held, until it is written out.
        int bytes = (int) (file.sizeBytes() == null ? LARGEST_FILE_BYTES : Math.max(1, file.sizeBytes()));
        Semaphore carrying = inline ? pictures : downloads;
        if (!carrying.tryAcquire(bytes)) {
            log.info("Attachment {} not read now: other files are being read", attachmentId);
            throw ConversationErrorCode.attachmentBusy();
        }
        AttachmentContent content;
        try {
            content = access.call(accountId, (connector, context) -> connector.fetchAttachment(context,
                    file.externalMessageId(), file.externalAttachmentId()));
        } catch (ProviderException failure) {
            log.warn("Attachment {} could not be read: {}", attachmentId, failure.errorCode());
            throw ConversationErrorCode.attachmentUnavailable();
        } catch (SinoException failure) {
            log.warn("Attachment {} could not be read: {}", attachmentId, failure.errorCode().code());
            throw ConversationErrorCode.attachmentUnavailable();
        } finally {
            carrying.release(bytes);
        }
        return new MessageFile(content.content(), file.mimeType() != null ? file.mimeType() : content.mimeType(),
                file.fileName(), inline);
    }

    private Optional<Stored> find(UUID conversationId, UUID messageId, UUID attachmentId) {
        return jdbc.sql("""
                SELECT m.external_message_id, a.external_attachment_id, a.file_name, a.mime_type, a.size_bytes
                FROM attachment a JOIN message m ON m.id = a.message_id
                WHERE a.id = :attachment AND m.id = :message AND m.conversation_id = :conversation
                """).param("attachment", attachmentId).param("message", messageId)
                .param("conversation", conversationId)
                .query((row, n) -> new Stored(row.getString(1), row.getString(2), row.getString(3), row.getString(4),
                        row.getObject(5, Long.class)))
                .optional();
    }

    private record Stored(String externalMessageId, String externalAttachmentId, String fileName, String mimeType,
            Long sizeBytes) {
    }

}
