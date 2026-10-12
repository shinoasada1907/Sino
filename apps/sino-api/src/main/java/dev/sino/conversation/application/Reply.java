package dev.sino.conversation.application;

import java.util.List;

import dev.sino.conversation.application.InboxMessage.Address;

/** Whether the user can reply in a conversation, and who a reply goes to; {@code to} is empty when nobody is known. */
public record Reply(ReplyState state, List<Address> to) {

    public Reply {
        to = List.copyOf(to);
    }

}
