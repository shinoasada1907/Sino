package dev.sino.conversation;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * The IDs the inbox shows (F05b, D-183): a thread found in several accounts of the owner is one row, named after its
 * oldest copy in the inbox. Other modules use it to name what changed the way the web knows it, for example
 * {@code conversations.changed} (D-189).
 */
public interface InboxIds {

    /**
     * The ID the inbox of the owner shows for each of these conversations, each once, in their order. An ID the inbox
     * does not show, such as a conversation of another owner or of an account turned off, stays as it is.
     */
    List<UUID> of(UUID ownerId, Collection<UUID> conversationIds);

}
