package dev.sino.conversation;

import java.util.UUID;

import dev.sino.provider.spi.SyncBatch;

/**
 * Stores the mail a connector read for an account (F05, D-63). Each conversation, participant, message and file is
 * found again by its external ID, so storing the same page twice changes nothing, and a message that did not change
 * is not written. Runs inside the caller's transaction, so the caller saves its cursor in the same commit.
 */
public interface ConversationStore {

    /**
     * Stores the conversations, participants, messages and file metadata of {@code batch}; its skipped items and
     * cursor are the caller's.
     *
     * @throws org.springframework.transaction.IllegalTransactionStateException when no transaction is active
     */
    StoreResult store(UUID accountId, SyncBatch batch);

}
