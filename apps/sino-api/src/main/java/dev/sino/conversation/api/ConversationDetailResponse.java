package dev.sino.conversation.api;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import dev.sino.conversation.application.InboxDetail;
import dev.sino.conversation.application.InboxParticipant;

/** The row of a conversation and who takes part in it; no messages before F06. */
record ConversationDetailResponse(@JsonUnwrapped ConversationResponse conversation,
        List<ParticipantResponse> participants) {

    static ConversationDetailResponse from(InboxDetail detail) {
        return new ConversationDetailResponse(ConversationResponse.from(detail.conversation()),
                detail.participants().stream().map(ParticipantResponse::from).toList());
    }

    /** {@code name} and {@code avatarUrl} may be null; {@code self} is the connected account. */
    record ParticipantResponse(String externalId, String name, String avatarUrl, boolean self) {

        static ParticipantResponse from(InboxParticipant participant) {
            return new ParticipantResponse(participant.externalId(), participant.name(), participant.avatarUrl(),
                    participant.self());
        }

    }

}
