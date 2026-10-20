package dev.sino.sticker.api;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import dev.sino.identity.CurrentUser;
import dev.sino.sticker.application.StickerPicture;
import dev.sino.sticker.application.StickerService;
import dev.sino.sticker.domain.Sticker;

/**
 * The sticker library of the signed-in user (spec {@code custom-stickers}, D-334). The service decides what is kept; this
 * only carries the file in and the picture out.
 */
@RestController
@RequestMapping("/api/stickers")
class StickersController {

    /**
     * The picture of a sticker never changes (to replace one is to delete it and keep another, with another ID), so the
     * browser may keep it for good; {@code private} because the request carries the session cookie (D-335).
     */
    private static final String PICTURE_CACHE = "private, max-age=31536000, immutable";

    private final StickerService stickers;
    private final CurrentUser currentUser;

    StickersController(StickerService stickers, CurrentUser currentUser) {
        this.stickers = stickers;
        this.currentUser = currentUser;
    }

    /**
     * Keeps a file as a sticker: a {@code multipart/form-data} request with the part {@code file} and, if the user typed
     * one, the part {@code name}, and the part {@code packId} for a sticker that goes into a pack (D-344; empty is no
     * pack). The file part is not required here: a missing one is the service's {@code STICKER_FILE_MISSING}, the same
     * answer as for an empty file.
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<StickerResponse> upload(@RequestPart(name = "file", required = false) MultipartFile file,
            @RequestParam(name = "name", required = false) String name,
            @RequestParam(name = "packId", required = false) UUID packId) {
        Sticker kept = stickers.upload(currentUser.requireOwnerId(), file == null ? null : file.getOriginalFilename(), name,
                packId, file == null ? null : bytesOf(file));
        URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(kept.id()).toUri();
        return ResponseEntity.created(location).body(StickerResponse.from(kept));
    }

    /** The stickers of the owner, newest first; with no paging, since the library is bounded by its limit. */
    @GetMapping
    StickersResponse list() {
        List<StickerResponse> items = stickers.list(currentUser.requireOwnerId()).stream().map(StickerResponse::from).toList();
        return new StickersResponse(items);
    }

    /** One sticker without its bytes; it is where {@code Location} of an upload leads. */
    @GetMapping("/{id}")
    StickerResponse get(@PathVariable UUID id) {
        return StickerResponse.from(stickers.get(currentUser.requireOwnerId(), id));
    }

    /** Renames a sticker, moves it to another pack or out of every pack, or both; its picture stays (D-344). */
    @PatchMapping("/{id}")
    StickerResponse change(@PathVariable UUID id, @Valid @RequestBody ChangeStickerRequest request) {
        return StickerResponse.from(stickers.change(currentUser.requireOwnerId(), id, request.toChange()));
    }

    /**
     * The picture of a sticker, as the type it was kept as. The type was found out from the file when it came in and is
     * sent with {@code nosniff}, so a browser never takes it for anything else.
     */
    @GetMapping("/{id}/content")
    ResponseEntity<byte[]> content(@PathVariable UUID id) {
        StickerPicture picture = stickers.picture(currentUser.requireOwnerId(), id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(picture.mediaType().value()))
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .header(HttpHeaders.CACHE_CONTROL, PICTURE_CACHE)
                .body(picture.bytes());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        stickers.delete(currentUser.requireOwnerId(), id);
    }

    private static byte[] bytesOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("The upload could not be read.", e);
        }
    }

    record StickersResponse(List<StickerResponse> items) {
    }

}
