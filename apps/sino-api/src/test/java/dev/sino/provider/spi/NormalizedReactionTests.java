package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class NormalizedReactionTests {

    private static final Instant AT = Instant.parse("2026-10-21T08:00:00Z");
    private static final SyncCursor NEXT = new SyncCursor("m-9");

    private static NormalizedReaction reaction(String code) {
        return new NormalizedReaction("c-1", "m-1", "u-2", "Nguyen Van A", false, code, AT);
    }

    @Test
    void anEmptyOrMissingCodeIsARemoval() {
        assertThat(reaction("").removal()).isTrue();
        assertThat(reaction(null).removal()).isTrue();
        assertThat(reaction(null).code()).isEmpty();
        assertThat(reaction("/-heart").removal()).isFalse();
    }

    @Test
    void rejectsBlankIdsAndAMissingMoment() {
        assertThatThrownBy(() -> new NormalizedReaction(" ", "m-1", "u-2", null, false, "x", AT))
                .isInstanceOfSatisfying(ProviderException.class,
                        e -> assertThat(e.errorCode()).isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED));
        assertThatThrownBy(() -> new NormalizedReaction("c-1", "", "u-2", null, false, "x", AT))
                .isInstanceOf(ProviderException.class);
        assertThatThrownBy(() -> new NormalizedReaction("c-1", "m-1", null, null, false, "x", AT))
                .isInstanceOf(ProviderException.class);
        assertThatThrownBy(() -> new NormalizedReaction("c-1", "m-1", "u-2", null, false, "x", null))
                .isInstanceOf(ProviderException.class);
    }

    @Test
    void rejectsACodeOver64CharactersOrWithAControlCharacter() {
        assertThat(reaction("a".repeat(64)).code()).hasSize(64);
        assertThatThrownBy(() -> reaction("a".repeat(65))).isInstanceOf(ProviderException.class);
        assertThatThrownBy(() -> reaction("ab\ncd")).isInstanceOf(ProviderException.class);
    }

    @Test
    void aBlankNameBecomesNull() {
        assertThat(new NormalizedReaction("c-1", "m-1", "u-2", "  ", false, "x", AT).reactorName()).isNull();
    }

    @Test
    void theTextNeverNamesTheReactor() {
        assertThat(reaction("/-heart").toString()).doesNotContain("Nguyen").doesNotContain("u-2");
    }

    @Test
    void aBatchKeepsItsReactionsAndTheOldConstructorHasNone() {
        SyncBatch with = new SyncBatch(List.of(), List.of(), List.of(), List.of(reaction("/-heart")), NEXT, false);
        SyncBatch without = new SyncBatch(List.of(), List.of(), List.of(), NEXT, false);

        assertThat(with.reactions()).hasSize(1);
        assertThat(without.reactions()).isEmpty();
        assertThatThrownBy(() -> new SyncBatch(List.of(), List.of(), List.of(), null, NEXT, false))
                .isInstanceOf(NullPointerException.class).hasMessageContaining("reactions");
    }

    @Test
    void aBatchCopiesItsReactions() {
        List<NormalizedReaction> reactions = new ArrayList<>(List.of(reaction("/-heart")));
        SyncBatch batch = new SyncBatch(List.of(), List.of(), List.of(), reactions, NEXT, false);

        reactions.clear();

        assertThat(batch.reactions()).hasSize(1);
    }

    @Test
    void aReactionKindNeedsACodeAnEmojiAndALabel() {
        assertThat(new ReactionKind("/-heart", "❤️", "Tim", true).quick()).isTrue();
        assertThatThrownBy(() -> new ReactionKind(" ", "x", "y", false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ReactionKind("a".repeat(65), "x", "y", false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ReactionKind("a", "", "y", false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ReactionKind("a", "x", null, false)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aReactCommandChecksItsFieldsAndCopiesTheMetadata() {
        Map<String, String> metadata = new HashMap<>(Map.of("cliMsgId", "77"));
        ReactCommand command = new ReactCommand("c-1", null, "m-1", metadata, null);

        metadata.clear();

        assertThat(command.conversationType()).isEqualTo(ConversationType.DIRECT);
        assertThat(command.messageMetadata()).containsEntry("cliMsgId", "77");
        assertThat(command.removal()).isTrue();
        assertThatThrownBy(() -> new ReactCommand("", ConversationType.DIRECT, "m-1", null, "x"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ReactCommand("c-1", ConversationType.DIRECT, "", null, "x"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ReactCommand("c-1", ConversationType.DIRECT, "m-1", null, "a".repeat(65)))
                .isInstanceOf(IllegalArgumentException.class);
    }

}
