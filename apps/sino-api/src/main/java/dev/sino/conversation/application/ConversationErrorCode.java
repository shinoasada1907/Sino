package dev.sino.conversation.application;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;

public enum ConversationErrorCode implements ErrorCode {

    /**
     * No conversation with this ID in the caller's inbox. One of another user, of a removed or a disabled account is
     * reported the same way.
     */
    CONVERSATION_NOT_FOUND(ErrorCategory.NOT_FOUND);

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

}
