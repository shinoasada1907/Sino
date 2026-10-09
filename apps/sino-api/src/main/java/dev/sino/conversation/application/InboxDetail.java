package dev.sino.conversation.application;

import java.util.List;

/** One conversation of the inbox with its participants. */
public record InboxDetail(InboxItem conversation, List<InboxParticipant> participants) {
}
