package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class NormalizedParticipantTests {

    @Test
    void onlyTheIdIsRequired() {
        NormalizedParticipant participant = new NormalizedParticipant("alice", null, null, true);

        assertThat(participant.externalParticipantId()).isEqualTo("alice");
        assertThat(participant.self()).isTrue();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingId(String externalParticipantId) {
        assertRejectedAsInvalidPayload(() -> new NormalizedParticipant(externalParticipantId, "Alice", null, false));
    }

}
