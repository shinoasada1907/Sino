package dev.sino.conversation.application;

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
    ATTACHMENT_UNAVAILABLE(ErrorCategory.PROVIDER_FAILED);

    private final ErrorCategory category;

    ConversationErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
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

    static SinoException contentUnavailable() {
        return new SinoException(MESSAGE_CONTENT_UNAVAILABLE,
                "The full message cannot be read from its provider now; its text is shown instead.");
    }

}
