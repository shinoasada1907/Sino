package dev.sino.provider.spi;

/**
 * One reaction a connector offers (zalo-reactions, D-383): the provider's {@code code}, the {@code emoji} and the
 * {@code label} users see, and whether it is among the {@code quick} ones shown first.
 */
public record ReactionKind(String code, String emoji, String label, boolean quick) {

    public ReactionKind {
        if (code == null || code.isBlank() || code.length() > NormalizedReaction.MAX_CODE
                || code.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(
                    "code must be 1 to " + NormalizedReaction.MAX_CODE + " characters without a control character");
        }
        if (emoji == null || emoji.isBlank()) {
            throw new IllegalArgumentException("emoji must not be blank");
        }
        if (label == null || label.isBlank()) {
            throw new IllegalArgumentException("label must not be blank");
        }
    }

}
