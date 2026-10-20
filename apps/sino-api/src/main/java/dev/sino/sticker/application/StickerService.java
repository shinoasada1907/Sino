package dev.sino.sticker.application;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.common.error.SinoException;
import dev.sino.sticker.domain.Sticker;
import dev.sino.sticker.domain.StickerContent;
import dev.sino.sticker.domain.StickerErrorCode;
import dev.sino.sticker.domain.StickerImage;
import dev.sino.sticker.infrastructure.StickerContentRepository;
import dev.sino.sticker.infrastructure.StickerPackRepository;
import dev.sino.sticker.infrastructure.StickerRepository;

/**
 * The sticker library of a user (custom-stickers). Every method takes the owner from the web layer; a sticker of another
 * user is reported as not found (D-336).
 */
@Service
public class StickerService {

    private final StickerRepository stickers;
    private final StickerContentRepository contents;
    private final StickerPackRepository packs;
    private final StickerProperties properties;
    private final Clock clock;
    private final TransactionTemplate transaction;

    StickerService(StickerRepository stickers, StickerContentRepository contents, StickerPackRepository packs,
            StickerProperties properties, Clock clock,
            PlatformTransactionManager transactionManager) {
        this.stickers = stickers;
        this.contents = contents;
        this.packs = packs;
        this.properties = properties;
        this.clock = clock;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /**
     * Keeps an image in the library of the owner. The checks go from the cheapest to the dearest and nothing is written
     * until all have passed: a file is there, it is not larger than the limit (judged before anything is read of it), it
     * is an image of a known type with a sound head (D-332) and not larger than the side limit, the owner has not got it
     * already (DN-2), and has room for one more.
     *
     * @param fileName the name of the file as the client gave it, or {@code null}
     * @param requestedName the name the user typed, or {@code null}; see {@link StickerNames}
     * @throws SinoException {@code STICKER_FILE_MISSING}, {@code STICKER_TOO_LARGE}, {@code STICKER_TYPE_UNSUPPORTED},
     *         {@code STICKER_INVALID_IMAGE}, {@code STICKER_DUPLICATE} (with the {@code stickerId} kept),
     *         {@code STICKER_LIMIT_REACHED}
     */
    public Sticker upload(UUID ownerId, String fileName, String requestedName, byte[] content) {
        return upload(ownerId, fileName, requestedName, null, content);
    }

    /**
     * Keeps an image as {@link #upload(UUID, String, String, byte[])} does, in a pack of the owner (SP-03), or in none
     * for {@code null}.
     *
     * @throws SinoException {@code STICKER_PACK_NOT_FOUND} when the pack is not the owner's, also when it is deleted
     *         between the look and the write; and those of the other {@code upload}
     */
    public Sticker upload(UUID ownerId, String fileName, String requestedName, UUID packId, byte[] content) {
        if (content == null || content.length == 0) {
            throw new SinoException(StickerErrorCode.STICKER_FILE_MISSING, "No file was sent.");
        }
        long maxBytes = properties.maxFileSize().toBytes();
        if (content.length > maxBytes) {
            throw new SinoException(StickerErrorCode.STICKER_TOO_LARGE, "A sticker is at most " + maxBytes + " bytes.",
                    Map.of("maxBytes", maxBytes));
        }
        StickerImage image = StickerImage.read(content);
        if (image.width() > properties.maxSide() || image.height() > properties.maxSide()) {
            throw new SinoException(StickerErrorCode.STICKER_INVALID_IMAGE,
                    "A sticker is at most " + properties.maxSide() + " px wide and tall, not " + image.width() + " x " + image.height() + ".",
                    Map.of("maxSide", properties.maxSide()));
        }
        Sticker draft = Sticker.create(ownerId, StickerNames.of(requestedName, fileName), image, content, clock.instant());
        try {
            return transaction.execute(status -> {
                if (packId != null) {
                    requirePack(ownerId, packId);
                    draft.moveTo(packId);
                }
                return keep(draft, content);
            });
        } catch (DataIntegrityViolationException e) {
            // Two uploads of one file at the same moment both found no duplicate; the unique index let one of them in.
            // Or the pack was deleted after it was found; its foreign key refused the sticker.
            throw alreadyKept(ownerId, draft.sha256()).or(() -> packGone(ownerId, packId)).orElseThrow(() -> e);
        }
    }

    /**
     * Renames a sticker of the owner, puts it in another pack of the owner or in none, or both (SP-03). Its picture never
     * changes. The name follows the rules of an upload ({@link StickerNames}: blank is {@code Sticker}, a long one is cut).
     *
     * @throws SinoException {@code STICKER_NOT_FOUND}; {@code STICKER_PACK_NOT_FOUND} when the pack is not the owner's,
     *         also when it is deleted between the look and the write; nothing changes then
     */
    public Sticker change(UUID ownerId, UUID id, StickerChange change) {
        UUID target = change.pack() instanceof StickerChange.PackMove.Into into ? into.packId() : null;
        try {
            return transaction.execute(status -> {
                Sticker sticker = owned(ownerId, id);
                if (change.name() != null) {
                    sticker.rename(StickerNames.of(change.name(), null));
                }
                if (change.pack() != null) {
                    if (target != null) {
                        requirePack(ownerId, target);
                    }
                    sticker.moveTo(target);
                }
                // Flushed here so that a pack deleted after it was found fails in this transaction, where it is caught.
                stickers.flush();
                return sticker;
            });
        } catch (DataIntegrityViolationException e) {
            throw packGone(ownerId, target).orElseThrow(() -> e);
        }
    }

    private void requirePack(UUID ownerId, UUID packId) {
        if (packs.findByIdAndOwnerId(packId, ownerId).isEmpty()) {
            throw packNotFound();
        }
    }

    /** After a write was refused: the refusal says the pack is gone, when it is. */
    private Optional<SinoException> packGone(UUID ownerId, UUID packId) {
        if (packId == null || transaction.execute(status -> packs.findByIdAndOwnerId(packId, ownerId)).isPresent()) {
            return Optional.empty();
        }
        return Optional.of(packNotFound());
    }

    private static SinoException packNotFound() {
        return new SinoException(StickerErrorCode.STICKER_PACK_NOT_FOUND, "There is no such sticker pack.");
    }

    private Sticker keep(Sticker draft, byte[] content) {
        stickers.findByOwnerIdAndSha256(draft.ownerId(), draft.sha256()).ifPresent(existing -> {
            throw duplicate(existing.id());
        });
        if (stickers.countByOwnerId(draft.ownerId()) >= properties.maxPerOwner()) {
            throw new SinoException(StickerErrorCode.STICKER_LIMIT_REACHED,
                    "The library keeps at most " + properties.maxPerOwner() + " stickers. Delete one to add another.",
                    Map.of("maxPerOwner", properties.maxPerOwner()));
        }
        // Flushed here so that the row of the sticker is written before the bytes whose foreign key names it, whatever
        // order Hibernate would batch the two inserts in.
        Sticker saved = stickers.saveAndFlush(draft);
        contents.save(StickerContent.of(saved.id(), content));
        return saved;
    }

    /** Every sticker of the owner, newest first, without the bytes (the web draws a grid from them). */
    @Transactional(readOnly = true)
    public List<Sticker> list(UUID ownerId) {
        return stickers.findByOwnerIdOrderByCreatedAtDescIdDesc(ownerId);
    }

    /** One sticker of the owner, without its bytes. @throws SinoException {@code STICKER_NOT_FOUND} */
    @Transactional(readOnly = true)
    public Sticker get(UUID ownerId, UUID id) {
        return owned(ownerId, id);
    }

    /**
     * The picture of a sticker of the owner: its bytes and the media type to send them with. The sticker is found for
     * its owner first, so a sticker of another owner is never read.
     *
     * @throws SinoException {@code STICKER_NOT_FOUND}
     * @throws IllegalStateException when the sticker has no bytes, which the one transaction of {@link #upload} rules out
     */
    @Transactional(readOnly = true)
    public StickerPicture picture(UUID ownerId, UUID id) {
        Sticker sticker = owned(ownerId, id);
        StickerContent content = contents.findById(sticker.id())
                .orElseThrow(() -> new IllegalStateException("The sticker " + id + " has no bytes."));
        return new StickerPicture(sticker.mediaType(), content.bytes());
    }

    /**
     * Deletes a sticker of the owner with its bytes.
     *
     * @throws SinoException {@code STICKER_NOT_FOUND} when the owner has no such sticker (also the second time)
     */
    @Transactional
    public void delete(UUID ownerId, UUID id) {
        if (stickers.deleteOwned(id, ownerId) == 0) {
            throw notFound();
        }
    }

    private Sticker owned(UUID ownerId, UUID id) {
        return stickers.findByIdAndOwnerId(id, ownerId).orElseThrow(StickerService::notFound);
    }

    private static SinoException notFound() {
        // The same words for another owner's sticker and for one that does not exist.
        return new SinoException(StickerErrorCode.STICKER_NOT_FOUND, "There is no such sticker in the library.");
    }

    private Optional<SinoException> alreadyKept(UUID ownerId, byte[] sha256) {
        return stickers.findByOwnerIdAndSha256(ownerId, sha256).map(existing -> duplicate(existing.id()));
    }

    private static SinoException duplicate(UUID existingId) {
        return new SinoException(StickerErrorCode.STICKER_DUPLICATE, "This sticker is in the library already.",
                Map.of("stickerId", existingId.toString()));
    }

}
