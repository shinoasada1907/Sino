package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class NormalizedConversationTests {

    @Test
    void keepsValidData() {
        NormalizedConversation conversation = new NormalizedConversation("c-1", ConversationType.GROUP, "Team",
                null, List.of(participant("alice")), null);

        assertThat(conversation.externalConversationId()).isEqualTo("c-1");
        assertThat(conversation.type()).isEqualTo(ConversationType.GROUP);
        assertThat(conversation.participants()).hasSize(1);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingId(String externalConversationId) {
        assertRejectedAsInvalidPayload(() -> new NormalizedConversation(externalConversationId,
                ConversationType.DIRECT, null, null, List.of(), null));
    }

    @Test
    void anUnmappedTypeBecomesUnknown() {
        NormalizedConversation conversation = new NormalizedConversation("c-1", null, null, null, List.of(), null);

        assertThat(conversation.type()).isEqualTo(ConversationType.UNKNOWN);
    }

    @Test
    void noParticipantsMeansAnEmptyList() {
        NormalizedConversation conversation = new NormalizedConversation("c-1", ConversationType.DIRECT, null,
                null, null, null);

        assertThat(conversation.participants()).isEmpty();
    }

    @Test
    void copiesTheParticipants() {
        List<NormalizedParticipant> participants = new ArrayList<>(List.of(participant("alice")));
        NormalizedConversation conversation = new NormalizedConversation("c-1", ConversationType.GROUP, null,
                null, participants, null);

        participants.add(participant("bob"));

        assertThat(conversation.participants()).extracting(NormalizedParticipant::externalParticipantId)
                .containsExactly("alice");
        assertThatThrownBy(() -> conversation.participants().add(participant("carol")))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void rejectsANullParticipant() {
        List<NormalizedParticipant> participants = new ArrayList<>();
        participants.add(null);

        assertRejectedAsInvalidPayload(() -> new NormalizedConversation("c-1", ConversationType.GROUP, null, null,
                participants, null));
    }

    private static NormalizedParticipant participant(String externalParticipantId) {
        return new NormalizedParticipant(externalParticipantId, null, null, false);
    }

}
