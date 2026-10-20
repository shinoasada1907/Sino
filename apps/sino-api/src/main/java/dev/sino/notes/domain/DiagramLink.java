package dev.sino.notes.domain;

import java.util.Objects;
import java.util.UUID;

/**
 * An arrow of a {@link Diagram} from one side of a block to one side of another (D-211). Whether the blocks exist and
 * differ is checked by the diagram, which sees them all.
 *
 * @param label none, or at most {@value #MAX_LABEL_LENGTH} characters written on the arrow
 */
public record DiagramLink(UUID id, UUID from, Side fromSide, UUID to, Side toSide, String label) {

    public static final int MAX_LABEL_LENGTH = 80;

    public DiagramLink {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(from, "from");
        Objects.requireNonNull(fromSide, "fromSide");
        Objects.requireNonNull(to, "to");
        Objects.requireNonNull(toSide, "toSide");
        if (label != null && (label.length() > MAX_LABEL_LENGTH || label.indexOf('\0') >= 0)) {
            throw new IllegalArgumentException(
                    "the label of a link has at most " + MAX_LABEL_LENGTH + " characters and no NUL");
        }
    }

}
