package dev.sino.conversation;

import java.util.UUID;

/** Numbers about the stored mail that other modules show, for example the progress of an import (F05). */
public interface ConversationStats {

    /** How many messages of the account are stored, archived ones included. */
    long storedMessages(UUID accountId);

}
