package dev.sino.provider.spi;

import java.time.Instant;

/**
 * One reaction on one message (zalo-reactions, D-383): who put which provider code on which message, or took it off
 * when {@code code} is empty. {@code self} marks the connected account itself. {@code reactorName} may be
 * {@code null}. A code is the provider's own, at most {@value #MAX_CODE} characters without a control character, so
 * the connector maps it to what users see through {@link MessageProvider#reactionSet()}. The text of the record
 * never names the reactor.
 */
public record NormalizedReaction(String externalConversationId, String externalMessageId, String reactorExternalId,
        String reactorName, boolean self, String code, Instant reactedAt) {

    public static final int MAX_CODE = 64;

    public NormalizedReaction {
        PayloadChecks.requireText(externalConversationId, "externalConversationId");
        PayloadChecks.requireText(externalMessageId, "externalMessageId");
        PayloadChecks.requireText(reactorExternalId, "reactorExternalId");
        PayloadChecks.requireValue(reactedAt, "reactedAt");
        code = code == null ? "" : code;
        if (code.length() > MAX_CODE || code.chars().anyMatch(Character::isISOControl)) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "code must be at most " + MAX_CODE + " characters without a control character");
        }
        reactorName = reactorName == null || reactorName.isBlank() ? null : reactorName;
    }

    /** True when this takes the reactor's reaction off the message. */
    public boolean removal() {
        return code.isEmpty();
    }

    @Override
    public String toString() {
        return "NormalizedReaction[conversation=" + externalConversationId + ", message=" + externalMessageId
                + ", self=" + self + ", removal=" + removal() + ", reactedAt=" + reactedAt + "]";
    }

}
