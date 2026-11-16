package dev.sino.sticker.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import dev.sino.identity.CurrentUser;
import dev.sino.sticker.application.StickerPackService;
import dev.sino.sticker.application.StickerPackSummary;

/**
 * The sticker packs of the signed-in user (spec {@code sticker-packs}, D-344). Which stickers a pack holds is told by the
 * {@code packId} of each sticker in {@code /api/stickers}; a sticker goes into a pack at its upload or with
 * {@code PATCH /api/stickers/{id}}.
 */
@RestController
@RequestMapping("/api/sticker-packs")
class StickerPacksController {

    private final StickerPackService packs;
    private final CurrentUser currentUser;

    StickerPacksController(StickerPackService packs, CurrentUser currentUser) {
        this.packs = packs;
        this.currentUser = currentUser;
    }

    /** The packs of the owner, the oldest first; with no paging, since an owner has at most so many. */
    @GetMapping
    StickerPacksResponse list() {
        return new StickerPacksResponse(packs.list(currentUser.requireOwnerId()).stream().map(StickerPackResponse::from).toList());
    }

    /** One pack; it is where {@code Location} of a new pack leads. */
    @GetMapping("/{id}")
    StickerPackResponse get(@PathVariable UUID id) {
        return StickerPackResponse.from(packs.get(currentUser.requireOwnerId(), id));
    }

    @PostMapping
    ResponseEntity<StickerPackResponse> create(@Valid @RequestBody StickerPackRequest request) {
        StickerPackSummary created = packs.create(currentUser.requireOwnerId(), request.name());
        URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(StickerPackResponse.from(created));
    }

    @PatchMapping("/{id}")
    StickerPackResponse rename(@PathVariable UUID id, @Valid @RequestBody StickerPackRequest request) {
        return StickerPackResponse.from(packs.rename(currentUser.requireOwnerId(), id, request.name()));
    }

    /** Deletes a pack; its stickers stay in the library, in no pack (DN-1). */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        packs.delete(currentUser.requireOwnerId(), id);
    }

    record StickerPacksResponse(List<StickerPackResponse> items) {
    }

}
