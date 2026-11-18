package dev.sino.conversation.application;

import java.util.List;

import dev.sino.provider.spi.ReactionKind;

/**
 * One conversation of the inbox with its participants, whether and to whom the user can reply (F10), and the emoji its
 * provider lets the user drop (zalo-reactions, D-387; empty for a provider without them).
 */
public record InboxDetail(InboxItem conversation, List<InboxParticipant> participants, Reply reply,
        List<ReactionKind> reactionSet) {
}
