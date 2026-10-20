package dev.sino.conversation.application;

import java.util.List;

import dev.sino.conversation.application.InboxMessage.Address;

/**
 * Whether the user can reply in a conversation, and who a reply goes to; {@code to} is empty when nobody is known.
 * {@code canSendImages}: the reply is {@code READY} and the connector and the account send pictures (ZS-05, D-356).
 */
public record Reply(ReplyState state, List<Address> to, boolean canSendImages) {

    public Reply {
        to = List.copyOf(to);
    }

    public Reply(ReplyState state, List<Address> to) {
        this(state, to, false);
    }

}
