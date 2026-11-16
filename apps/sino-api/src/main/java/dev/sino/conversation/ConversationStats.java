package dev.sino.conversation;

import java.util.UUID;

/** Numbers about the stored mail that other modules show, for example the progress of an import (F05). */
public interface ConversationStats {

    /** How many messages of the account are stored, archived ones included. */
    long storedMessages(UUID accountId);

    /**
     * About how many bytes the stored mail of the account takes in the database (D-403): its conversations, their
     * people, the messages with their text, HTML and metadata, and the attachments, which are only a name and a size.
     */
    long storedBytes(UUID accountId);

}
