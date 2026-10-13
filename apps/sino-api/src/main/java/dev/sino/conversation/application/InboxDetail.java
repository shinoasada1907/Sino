package dev.sino.conversation.application;

import java.util.List;

/** One conversation of the inbox with its participants, and whether and to whom the user can reply (F10). */
public record InboxDetail(InboxItem conversation, List<InboxParticipant> participants, Reply reply) {
}
