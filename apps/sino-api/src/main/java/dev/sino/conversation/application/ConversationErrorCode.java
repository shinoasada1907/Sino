package dev.sino.conversation.application;

import java.util.Map;
import java.util.UUID;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;

public enum ConversationErrorCode implements ErrorCode {

    /**
     * No conversation with this ID in the caller's inbox. One of another user, of a removed or a disabled account is
     * reported the same way.
     */
    CONVERSATION_NOT_FOUND(ErrorCategory.NOT_FOUND),

    /** No message with this ID in that conversation (F06). */
    MESSAGE_NOT_FOUND(ErrorCategory.NOT_FOUND),

    /**
     * A message stored before Sino kept HTML could not be read again from its provider, or its account cannot be
     * used now (F06, D-122); the next request tries again.
     */
    MESSAGE_CONTENT_UNAVAILABLE(ErrorCategory.PROVIDER_FAILED),

    /** No attachment with this ID in that message (F06). */
    ATTACHMENT_NOT_FOUND(ErrorCategory.NOT_FOUND),

    /** Shown inside the mail only as a PNG, JPEG, GIF or WebP picture; anything else is downloaded (D-125). */
    ATTACHMENT_NOT_INLINE(ErrorCategory.INVALID),

    /** Larger than Sino carries (25 MB); the provider is not asked (F06). */
    ATTACHMENT_TOO_LARGE(ErrorCategory.INVALID),

    /** Other files take what Sino carries at once; a later request may get it (F06). */
    ATTACHMENT_BUSY(ErrorCategory.DEPENDENCY_UNAVAILABLE),

    /** The provider could not give the attachment now, or the account cannot be used now (F06). */
    ATTACHMENT_UNAVAILABLE(ErrorCategory.PROVIDER_FAILED),

    /** A message with this {@code clientMessageId} is being sent now; it is not sent a second time (F10, D-131). */
    SEND_IN_PROGRESS(ErrorCategory.CONFLICT),

    /** The account cannot send now; the problem response says why in {@code state} (F10, D-130). */
    REPLY_NOT_ALLOWED(ErrorCategory.CONFLICT),

    /** Nobody to send a reply to: no sender, no Reply-To, no addressee Sino knows (F10, D-137). */
    REPLY_NO_RECIPIENT(ErrorCategory.INVALID),

    /** The provider refused the message or could not be reached: it did not go and may be sent again (F10). */
    SEND_FAILED(ErrorCategory.PROVIDER_FAILED),

    /** The provider gave no answer: the message may have gone, and Sino finds out with the next sync (D-132). */
    SEND_OUTCOME_UNKNOWN(ErrorCategory.PROVIDER_OUTCOME_UNKNOWN),

    /** The same, for a message already in that state when it is sent again: nothing is sent (D-131). */
    SEND_OUTCOME_STILL_UNKNOWN(ErrorCategory.CONFLICT, "SEND_OUTCOME_UNKNOWN"),

    /** Only a message Sino failed to send can be discarded (F10). */
    MESSAGE_NOT_DELETABLE(ErrorCategory.CONFLICT);

    private final ErrorCategory category;
    private final String code;

    ConversationErrorCode(ErrorCategory category) {
        this(category, null);
    }

    // The contract gives two outcomes the same code; the web tells them apart by status.
    ConversationErrorCode(ErrorCategory category, String code) {
        this.category = category;
        this.code = code;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

    @Override
    public String code() {
        return code != null ? code : name();
    }

    static SinoException conversationNotFound() {
        return new SinoException(CONVERSATION_NOT_FOUND, "Conversation not found.");
    }

    static SinoException messageNotFound() {
        return new SinoException(MESSAGE_NOT_FOUND, "Message not found.");
    }

    static SinoException attachmentNotFound() {
        return new SinoException(ATTACHMENT_NOT_FOUND, "Attachment not found.");
    }

    static SinoException attachmentNotInline() {
        return new SinoException(ATTACHMENT_NOT_INLINE, "Only a PNG, JPEG, GIF or WebP picture is shown in the mail.");
    }

    static SinoException attachmentTooLarge() {
        return new SinoException(ATTACHMENT_TOO_LARGE, "The attachment is larger than 25 MB; open it at its provider.");
    }

    static SinoException attachmentBusy() {
        return new SinoException(ATTACHMENT_BUSY, "Other attachments are being read now; try again shortly.");
    }

    static SinoException attachmentUnavailable() {
        return new SinoException(ATTACHMENT_UNAVAILABLE, "The attachment cannot be read from its provider now.");
    }

    static SinoException sendInProgress() {
        return new SinoException(SEND_IN_PROGRESS, "This message is being sent now.");
    }

    static SinoException replyNotAllowed(ReplyState state) {
        return new SinoException(REPLY_NOT_ALLOWED, "This account cannot send a reply now.",
                Map.of("state", state.name()));
    }

    static SinoException noRecipient() {
        return new SinoException(REPLY_NO_RECIPIENT, "Nobody is known to send this reply to.");
    }

    static SinoException sendFailed(UUID messageId) {
        return new SinoException(SEND_FAILED, "The message was not sent; it can be sent again.",
                Map.of("messageId", messageId.toString()));
    }

    static SinoException sendOutcomeUnknown(UUID messageId) {
        return new SinoException(SEND_OUTCOME_UNKNOWN, "No answer came about this message; Sino checks it later.",
                Map.of("messageId", messageId.toString()));
    }

    static SinoException sendOutcomeStillUnknown(UUID messageId) {
        return new SinoException(SEND_OUTCOME_STILL_UNKNOWN, "Whether this message went is still being checked.",
                Map.of("messageId", messageId.toString()));
    }

    static SinoException messageNotDeletable() {
        return new SinoException(MESSAGE_NOT_DELETABLE, "Only a message that failed to send can be discarded.");
    }

    static SinoException contentUnavailable() {
        return new SinoException(MESSAGE_CONTENT_UNAVAILABLE,
                "The full message cannot be read from its provider now; its text is shown instead.");
    }

}
