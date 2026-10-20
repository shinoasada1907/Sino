package dev.sino.notes.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** The rules of a diagram (D-179): what the API and the database may rely on once a {@link Diagram} exists. */
class DiagramTests {

    private static final UUID A = id(1);
    private static final UUID B = id(2);
    private static final UUID C = id(3);

    private static UUID id(int n) {
        return UUID.fromString("00000000-0000-7000-8000-%012d".formatted(n));
    }

    private static DiagramBlock block(UUID id, String text) {
        return new DiagramBlock(id, 120.5, 80, text, BlockColor.DEFAULT, false);
    }

    private static DiagramLink link(int n, UUID from, UUID to) {
        return new DiagramLink(id(1000 + n), from, Side.RIGHT, to, Side.LEFT, null);
    }

    private static List<DiagramBlock> blocks(int count) {
        return IntStream.rangeClosed(1, count).mapToObj(n -> block(id(n), "Khối " + n)).toList();
    }

    @Test
    void aDiagramKeepsItsBlocksAndLinksInOrder() {
        DiagramBlock main = new DiagramBlock(A, 0, 0, "Chuyến đi Đà Lạt", BlockColor.YELLOW, true);
        DiagramBlock stay = block(B, "Thuê homestay");
        DiagramLink arrow = new DiagramLink(id(1001), A, Side.BOTTOM, B, Side.TOP, "ở đâu");

        Diagram diagram = new Diagram(List.of(main, stay), List.of(arrow));

        assertThat(diagram.blocks()).containsExactly(main, stay);
        assertThat(diagram.links()).containsExactly(arrow);
    }

    @Test
    void aDiagramCannotBeChangedAfterwardsThroughTheListsItWasBuiltFrom() {
        List<DiagramBlock> blocks = new ArrayList<>(List.of(block(A, "Một")));
        Diagram diagram = new Diagram(blocks, List.of());

        blocks.add(block(B, "Hai"));

        assertThat(diagram.blocks()).hasSize(1);
        org.junit.jupiter.api.Assertions.assertThrows(UnsupportedOperationException.class,
                () -> diagram.blocks().add(block(B, "Hai")));
    }

    @Test
    void twoDiagramsWithTheSameContentAreEqual() {
        Diagram first = new Diagram(List.of(block(A, "Một"), block(B, "Hai")), List.of(link(1, A, B)));
        Diagram second = new Diagram(List.of(block(A, "Một"), block(B, "Hai")), List.of(link(1, A, B)));

        assertThat(first).isEqualTo(second).hasSameHashCodeAs(second);
        assertThat(first).isNotEqualTo(new Diagram(List.of(block(A, "Một"), block(B, "Hai!")), List.of(link(1, A, B))));
    }

    @Test
    void aDiagramNeedsAtLeastOneBlock() {
        assertThatIllegalArgumentException().isThrownBy(() -> new Diagram(List.of(), List.of()));
    }

    @Test
    void aDiagramHasAtMostThreeHundredBlocks() {
        assertThat(new Diagram(blocks(300), List.of()).blocks()).hasSize(300);
        assertThatIllegalArgumentException().isThrownBy(() -> new Diagram(blocks(301), List.of()));
    }

    @Test
    void aDiagramHasAtMostSixHundredLinks() {
        List<DiagramBlock> blocks = blocks(40);
        List<DiagramLink> links = new ArrayList<>();
        int n = 0;
        for (int from = 1; from <= 40 && links.size() < 601; from++) {
            for (int to = 1; to <= 40 && links.size() < 601; to++) {
                if (from != to) {
                    links.add(link(++n, id(from), id(to)));
                }
            }
        }

        assertThat(new Diagram(blocks, links.subList(0, 600)).links()).hasSize(600);
        assertThatIllegalArgumentException().isThrownBy(() -> new Diagram(blocks, links));
    }

    @Test
    void twoBlocksCannotShareAnId() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new Diagram(List.of(block(A, "Một"), block(A, "Hai")), List.of()));
    }

    @Test
    void twoLinksCannotShareAnId() {
        DiagramLink first = new DiagramLink(id(1001), A, Side.RIGHT, B, Side.LEFT, null);
        DiagramLink second = new DiagramLink(id(1001), B, Side.RIGHT, C, Side.LEFT, null);

        assertThatIllegalArgumentException().isThrownBy(
                () -> new Diagram(List.of(block(A, "Một"), block(B, "Hai"), block(C, "Ba")), List.of(first, second)));
    }

    @Test
    void aLinkMustJoinTwoBlocksOfTheDiagram() {
        List<DiagramBlock> blocks = List.of(block(A, "Một"), block(B, "Hai"));

        assertThatIllegalArgumentException().isThrownBy(() -> new Diagram(blocks, List.of(link(1, A, C))));
        assertThatIllegalArgumentException().isThrownBy(() -> new Diagram(blocks, List.of(link(1, C, B))));
    }

    @Test
    void aBlockCannotBeLinkedToItself() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new Diagram(List.of(block(A, "Một")), List.of(link(1, A, A))));
    }

    @Test
    void aPairOfBlocksHasOneLinkPerDirection() {
        List<DiagramBlock> blocks = List.of(block(A, "Một"), block(B, "Hai"));

        assertThatIllegalArgumentException()
                .isThrownBy(() -> new Diagram(blocks, List.of(link(1, A, B), link(2, A, B))));
        assertThat(new Diagram(blocks, List.of(link(1, A, B), link(2, B, A))).links()).hasSize(2);
    }

    @Test
    void theTextOfABlockHasAtMostTwoThousandCharactersAndMayBeEmpty() {
        assertThat(block(A, "").text()).isEmpty();
        assertThat(block(A, "x".repeat(2_000)).text()).hasSize(2_000);
        assertThatIllegalArgumentException().isThrownBy(() -> block(A, "x".repeat(2_001)));
    }

    // PostgreSQL refuses NUL in text, so a diagram holding one would end as a 500 instead of a refused request.
    @ParameterizedTest
    @ValueSource(strings = { "Mã\u0000", "\u0000" })
    void aBlockTextWithNulIsRefused(String text) {
        assertThatIllegalArgumentException().isThrownBy(() -> block(A, text));
    }

    @Test
    void theLabelOfALinkIsNoneOrAtMostEightyCharacters() {
        assertThat(new DiagramLink(id(1), A, Side.TOP, B, Side.TOP, null).label()).isNull();
        assertThat(new DiagramLink(id(1), A, Side.TOP, B, Side.TOP, "x".repeat(80)).label()).hasSize(80);
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new DiagramLink(id(1), A, Side.TOP, B, Side.TOP, "x".repeat(81)));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new DiagramLink(id(1), A, Side.TOP, B, Side.TOP, "ở\u0000đâu"));
    }

    @ParameterizedTest
    @ValueSource(doubles = { Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY })
    void thePositionOfABlockIsAFiniteNumber(double bad) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new DiagramBlock(A, bad, 0, "Một", BlockColor.DEFAULT, false));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new DiagramBlock(A, 0, bad, "Một", BlockColor.DEFAULT, false));
    }

    @Test
    void aBlockNeedsAnIdATextAndAColor() {
        assertThatNullPointerException()
                .isThrownBy(() -> new DiagramBlock(null, 0, 0, "Một", BlockColor.DEFAULT, false));
        assertThatNullPointerException().isThrownBy(() -> new DiagramBlock(A, 0, 0, null, BlockColor.DEFAULT, false));
        assertThatNullPointerException().isThrownBy(() -> new DiagramBlock(A, 0, 0, "Một", null, false));
    }

    @Test
    void aLinkNeedsAnIdTwoEndsAndTwoSides() {
        assertThatNullPointerException().isThrownBy(() -> new DiagramLink(null, A, Side.TOP, B, Side.TOP, null));
        assertThatNullPointerException().isThrownBy(() -> new DiagramLink(id(1), null, Side.TOP, B, Side.TOP, null));
        assertThatNullPointerException().isThrownBy(() -> new DiagramLink(id(1), A, null, B, Side.TOP, null));
        assertThatNullPointerException().isThrownBy(() -> new DiagramLink(id(1), A, Side.TOP, null, Side.TOP, null));
        assertThatNullPointerException().isThrownBy(() -> new DiagramLink(id(1), A, Side.TOP, B, null, null));
    }

    @Test
    void aDiagramNeedsItsTwoLists() {
        assertThatNullPointerException().isThrownBy(() -> new Diagram(null, List.of()));
        assertThatNullPointerException().isThrownBy(() -> new Diagram(List.of(block(A, "Một")), null));
    }

}
