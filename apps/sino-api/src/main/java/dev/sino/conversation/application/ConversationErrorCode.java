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
    MESSAGE_CONTENT_UNAVAILABLE(ErrorCategory.PROVIDER_FAILED);

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

    static SinoException contentUnavailable() {
        return new SinoException(MESSAGE_CONTENT_UNAVAILABLE,
                "The full message cannot be read from its provider now; its text is shown instead.");
    }

}
