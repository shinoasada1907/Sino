package dev.sino.provider.infrastructure.gmail;

import java.util.List;

import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;

/**
 * One Gmail message, normalized, with what its conversation needs: {@code title} is the Subject without reply or
 * forward prefixes (optional), {@code participants} the people of From, To and Cc.
 */
record NormalizedGmailMessage(NormalizedMessage message, String title, List<NormalizedParticipant> participants) {

    NormalizedGmailMessage {
        participants = List.copyOf(participants);
    }

}
