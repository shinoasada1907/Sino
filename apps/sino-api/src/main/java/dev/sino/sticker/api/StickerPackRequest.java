package dev.sino.sticker.api;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import dev.sino.sticker.domain.StickerPack;

/**
 * Body of {@code POST /api/sticker-packs} and {@code PATCH /api/sticker-packs/{id}} (D-344): the name of the pack. The
 * rule is the pack's own ({@link StickerPack#isAllowedName}): {@code @NotBlank} and {@code @Size} would trim fewer
 * spaces (not U+3000) and count UTF-16 units instead of characters, and a name they let through would end as a 500.
 */
record StickerPackRequest(
        @NotNull
        // PostgreSQL refuses U+0000 in varchar, which would end as a 500 instead of a 400 (as in the notes, review BE-71).
        @Pattern(regexp = "[^\\x00]*", message = "must not contain the NUL character") String name) {

    @AssertTrue(message = "name must have 1 to " + StickerPack.MAX_NAME_LENGTH + " characters besides the spaces around it")
    boolean isNameOfAllowedLength() {
        return name == null || StickerPack.isAllowedName(name);
    }

}
