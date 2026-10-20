package dev.sino.sticker.application;

import java.util.UUID;

/**
 * What a change of a sticker asks for (SP-03): a new name, a new place, or both. {@code null} leaves that part as it is;
 * the place is its own type because "leave the pack as it is", "take it out of every pack" and "put it in pack X" are
 * three different things that a nullable pack ID cannot tell apart.
 *
 * @param name the new name, by the rules of an upload ({@link StickerNames}), or {@code null}
 * @param pack where the sticker goes, or {@code null}
 */
public record StickerChange(String name, PackMove pack) {

    public StickerChange {
        if (name == null && pack == null) {
            throw new IllegalArgumentException("a change of a sticker names a new name, a new pack or both");
        }
    }

    /** Where a change puts a sticker: in a pack of its owner, or in none. */
    public sealed interface PackMove {

        static PackMove into(UUID packId) {
            return new Into(packId);
        }

        static PackMove out() {
            return new Out();
        }

        record Into(UUID packId) implements PackMove {

            public Into {
                if (packId == null) {
                    throw new IllegalArgumentException("a move into a pack names the pack");
                }
            }

        }

        record Out() implements PackMove {
        }

    }

}
