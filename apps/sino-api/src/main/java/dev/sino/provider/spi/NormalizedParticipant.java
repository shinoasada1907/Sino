package dev.sino.provider.spi;

/**
 * A person or bot in a conversation. {@code self} marks the connected account itself.
 */
public record NormalizedParticipant(String externalParticipantId, String displayName, String avatarUrl,
        boolean self) {

    public NormalizedParticipant {
        PayloadChecks.requireText(externalParticipantId, "externalParticipantId");
    }

}
