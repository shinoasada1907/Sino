package dev.sino.notes.domain;

import java.util.Objects;
import java.util.UUID;

/**
 * A block of a {@link Diagram}: a piece of text at a position on the canvas. The web makes the ID, so that an arrow can
 * point at a block before anything is saved (D-211).
 *
 * @param x    the left edge on the canvas, in px at 100 % zoom
 * @param y    the top edge on the canvas, in px at 100 % zoom
 * @param text 0 to {@value #MAX_TEXT_LENGTH} characters; an empty block is shown as "Khối mới"
 * @param main a main block: its text is bold
 */
public record DiagramBlock(UUID id, double x, double y, String text, BlockColor color, boolean main) {

    public static final int MAX_TEXT_LENGTH = 2_000;

    public DiagramBlock {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(text, "text");
        Objects.requireNonNull(color, "color");
        if (!Double.isFinite(x) || !Double.isFinite(y)) {
            throw new IllegalArgumentException("a block sits at a finite position");
        }
        if (text.length() > MAX_TEXT_LENGTH || text.indexOf('\0') >= 0) {
            throw new IllegalArgumentException(
                    "the text of a block has at most " + MAX_TEXT_LENGTH + " characters and no NUL");
        }
    }

}
