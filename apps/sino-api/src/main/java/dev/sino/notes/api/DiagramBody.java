package dev.sino.notes.api;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import dev.sino.notes.domain.BlockColor;
import dev.sino.notes.domain.Diagram;
import dev.sino.notes.domain.DiagramBlock;
import dev.sino.notes.domain.DiagramLink;
import dev.sino.notes.domain.Side;

/**
 * A diagram as JSON, in a request and in a response (contract D-211 of {@code fe-ui-diagram-notes}). The fields are
 * boxed and {@code @NotNull} so that a field left out is reported by name; the rules that look across blocks and
 * arrows belong to {@link Diagram} and are applied by {@link FollowsDiagramRules}.
 */
record DiagramBody(
        @NotNull List<@NotNull @Valid BlockBody> blocks,
        @NotNull List<@NotNull @Valid LinkBody> links) {

    record BlockBody(@NotNull UUID id, @NotNull Double x, @NotNull Double y, @NotNull String text,
            @NotNull BlockColor color, @NotNull Boolean main) {
    }

    record LinkBody(@NotNull UUID id, @NotNull UUID from, @NotNull Side fromSide, @NotNull UUID to,
            @NotNull Side toSide, String label) {
    }

    static DiagramBody from(Diagram diagram) {
        return new DiagramBody(
                diagram.blocks().stream()
                        .map(b -> new BlockBody(b.id(), b.x(), b.y(), b.text(), b.color(), b.main())).toList(),
                diagram.links().stream()
                        .map(l -> new LinkBody(l.id(), l.from(), l.fromSide(), l.to(), l.toSide(), l.label()))
                        .toList());
    }

    /**
     * The domain diagram.
     *
     * @throws NullPointerException     when a field is missing (reported by {@code @NotNull})
     * @throws IllegalArgumentException when the diagram breaks a rule; the message says which
     */
    Diagram toDiagram() {
        return new Diagram(
                blocks.stream()
                        .map(b -> new DiagramBlock(b.id(), b.x(), b.y(), b.text(), b.color(), b.main())).toList(),
                links.stream()
                        .map(l -> new DiagramLink(l.id(), l.from(), l.fromSide(), l.to(), l.toSide(), l.label()))
                        .toList());
    }

}
