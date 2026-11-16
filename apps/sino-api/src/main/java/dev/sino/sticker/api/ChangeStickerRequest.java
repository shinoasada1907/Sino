package dev.sino.sticker.api;

import java.util.UUID;
import java.util.regex.Pattern;

import jakarta.validation.constraints.AssertTrue;

import tools.jackson.databind.JsonNode;

import dev.sino.sticker.application.StickerChange;
import dev.sino.sticker.application.StickerChange.PackMove;

/**
 * Body of {@code PATCH /api/stickers/{id}} (D-344): {@code name}, {@code packId}, or both. A field left out, or a
 * {@code null} name, stays as it is; the name follows the rules of an upload.
 * <p>
 * {@code packId} is read as a JSON tree and not as a {@link UUID}: a field left out is then Java {@code null} and
 * {@code "packId": null} is a {@code NullNode}, which takes the sticker out of every pack. A {@code UUID} field would be
 * {@code null} for both, and "keep the pack" and "no pack" could not be told apart.
 */
record ChangeStickerRequest(String name, JsonNode packId) {

    /** An ID as the API writes one; {@link UUID#fromString} alone also takes {@code 1-1-1-1-1}. */
    private static final Pattern ID = Pattern.compile("\\p{XDigit}{8}-\\p{XDigit}{4}-\\p{XDigit}{4}-\\p{XDigit}{4}-\\p{XDigit}{12}");

    @AssertTrue(message = "give at least one of name, packId")
    boolean isAnyFieldGiven() {
        return name != null || packId != null;
    }

    @AssertTrue(message = "packId must be the ID of a pack, or null for no pack")
    boolean isPackIdAnIdOrNull() {
        return packId == null || packId.isNull() || idIn(packId) != null;
    }

    StickerChange toChange() {
        return new StickerChange(name, packId == null ? null : packId.isNull() ? PackMove.out() : PackMove.into(idIn(packId)));
    }

    private static UUID idIn(JsonNode node) {
        return node.isString() && ID.matcher(node.stringValue()).matches() ? UUID.fromString(node.stringValue()) : null;
    }

}
