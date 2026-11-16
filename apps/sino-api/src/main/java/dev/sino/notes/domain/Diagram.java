package dev.sino.notes.domain;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * The whole content of a diagram note (D-179, contract D-211): blocks and the arrows between them. It is saved as one
 * document and replaced as a whole at every edit, so the rules that look across blocks and arrows are kept here, once,
 * and a {@code Diagram} that exists is one the database may store:
 * <ul>
 * <li>1 to {@value #MAX_BLOCKS} blocks and at most {@value #MAX_LINKS} arrows;</li>
 * <li>no two blocks, and no two arrows, share an ID;</li>
 * <li>an arrow joins two different blocks of this diagram, and a pair (from, to) has at most one arrow.</li>
 * </ul>
 * The lists are copied, so the diagram cannot be changed through the lists it was built from. Equality is by content,
 * which is how an edit that sends the same diagram again is told from one that changes it.
 */
public record Diagram(List<DiagramBlock> blocks, List<DiagramLink> links) {

    public static final int MAX_BLOCKS = 300;
    public static final int MAX_LINKS = 600;

    public Diagram {
        blocks = List.copyOf(blocks);
        links = List.copyOf(links);
        if (blocks.isEmpty() || blocks.size() > MAX_BLOCKS) {
            throw new IllegalArgumentException("a diagram has 1 to " + MAX_BLOCKS + " blocks, not " + blocks.size());
        }
        if (links.size() > MAX_LINKS) {
            throw new IllegalArgumentException("a diagram has at most " + MAX_LINKS + " links, not " + links.size());
        }
        Set<UUID> blockIds = new HashSet<>();
        for (DiagramBlock block : blocks) {
            if (!blockIds.add(block.id())) {
                throw new IllegalArgumentException("two blocks share the ID " + block.id());
            }
        }
        Set<UUID> linkIds = new HashSet<>();
        Set<Ends> pairs = new HashSet<>();
        for (DiagramLink link : links) {
            if (!linkIds.add(link.id())) {
                throw new IllegalArgumentException("two links share the ID " + link.id());
            }
            if (!blockIds.contains(link.from()) || !blockIds.contains(link.to())) {
                throw new IllegalArgumentException("link " + link.id() + " joins a block that is not in the diagram");
            }
            if (link.from().equals(link.to())) {
                throw new IllegalArgumentException("link " + link.id() + " joins a block to itself");
            }
            if (!pairs.add(new Ends(link.from(), link.to()))) {
                throw new IllegalArgumentException("two links join " + link.from() + " to " + link.to());
            }
        }
    }

    private record Ends(UUID from, UUID to) {
    }

}
