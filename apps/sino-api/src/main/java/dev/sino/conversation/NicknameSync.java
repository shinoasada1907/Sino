package dev.sino.conversation;

import java.util.UUID;

/**
 * Keeps {@code conversation.nickname} following the provider (zalo-nicknames, D-418): the {@code sync} module calls
 * {@link #syncAll()} every {@code sino.sync.nicknames.interval} (5 min by default). Call outside a transaction: it
 * asks the provider.
 */
public interface NicknameSync {

    /**
     * For {@code accountId} alone, when its connector has {@code NICKNAMES}: reads every nickname the provider has
     * and rewrites the nickname of each of its DIRECT conversations to match, {@code null} for one the provider does
     * not name. Only a row that truly changes is written, and each one publishes its own {@link ConversationChanged}.
     * A failure leaves the stored nicknames as they are.
     */
    void sync(UUID accountId);

    /** {@link #sync} for every connected account whose connector declares {@code NICKNAMES}. */
    void syncAll();

}
