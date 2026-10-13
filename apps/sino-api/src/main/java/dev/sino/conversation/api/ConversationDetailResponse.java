package dev.sino.conversation.api;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import dev.sino.conversation.application.InboxDetail;
import dev.sino.conversation.application.InboxMessage.Address;
import dev.sino.conversation.application.InboxParticipant;
import dev.sino.conversation.application.Reply;

/**
 * The row of a conversation, who takes part in it, and whether and to whom the user can reply (F10); the messages
 * come from their own endpoint (F06).
 */
record ConversationDetailResponse(@JsonUnwrapped ConversationResponse conversation,
        List<ParticipantResponse> participants, ReplyResponse reply) {

    static ConversationDetailResponse from(InboxDetail detail) {
        return new ConversationDetailResponse(ConversationResponse.from(detail.conversation()),
                detail.participants().stream().map(ParticipantResponse::from).toList(),
                ReplyResponse.from(detail.reply()));
    }

    /** {@code name} and {@code avatarUrl} may be null; {@code self} is the connected account. */
    record ParticipantResponse(String externalId, String name, String avatarUrl, boolean self) {

        static ParticipantResponse from(InboxParticipant participant) {
            return new ParticipantResponse(participant.externalId(), participant.name(), participant.avatarUrl(),
                    participant.self());
        }

    }

    /**
     * {@code state}: {@code READY}, {@code NEEDS_PERMISSION}, {@code ACCOUNT_UNAVAILABLE} or {@code NOT_SUPPORTED};
     * a {@code name} in {@code to} is null when the header gave none.
     */
    record ReplyResponse(String state, List<Address> to) {

        static ReplyResponse from(Reply reply) {
            return new ReplyResponse(reply.state().name(), reply.to());
        }

    }

}
