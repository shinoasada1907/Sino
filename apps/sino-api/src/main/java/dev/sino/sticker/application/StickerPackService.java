package dev.sino.sticker.application;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.common.error.SinoException;
import dev.sino.sticker.domain.StickerErrorCode;
import dev.sino.sticker.domain.StickerPack;
import dev.sino.sticker.infrastructure.StickerPackRepository;
import dev.sino.sticker.infrastructure.StickerRepository;
import dev.sino.sticker.infrastructure.StickerRepository.PackContents;

/**
 * The sticker packs of a user (sticker-packs, SP-02): create, rename, delete, list. Every method takes the owner from
 * the web layer; a pack of another user is reported as not found.
 * <p>
 * That a name is used once per owner is checked first, for a clear error, and held by the unique index on
 * {@code lower(name)}: two requests with one name at the same moment both pass the check, and the index refuses the one
 * that writes second, at the flush. As for a duplicate sticker (D-339), that refusal is caught outside the transaction
 * that failed and the name is looked up again in a new one (D-343). How many packs an owner has is counted, not locked.
 */
@Service
public class StickerPackService {

    private final StickerPackRepository packs;
    private final StickerRepository stickers;
    private final StickerProperties properties;
    private final Clock clock;
    private final TransactionTemplate transaction;

    StickerPackService(StickerPackRepository packs, StickerRepository stickers, StickerProperties properties, Clock clock,
            PlatformTransactionManager transactionManager) {
        this.packs = packs;
        this.stickers = stickers;
        this.properties = properties;
        this.clock = clock;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /** The packs of the owner, the oldest first, each with how many stickers it holds and its newest one. */
    @Transactional(readOnly = true)
    public List<StickerPackSummary> list(UUID ownerId) {
        Map<UUID, PackContents> contents = contentsOf(ownerId);
        return packs.findByOwnerIdOrderByCreatedAtAscIdAsc(ownerId).stream()
                .map(pack -> summaryOf(pack, contents.get(pack.id())))
                .toList();
    }

    /** @throws SinoException {@code STICKER_PACK_NOT_FOUND} */
    @Transactional(readOnly = true)
    public StickerPackSummary get(UUID ownerId, UUID id) {
        StickerPack pack = owned(ownerId, id);
        return summaryOf(pack, contentsOf(ownerId).get(pack.id()));
    }

    /**
     * @throws IllegalArgumentException when the name is blank or too long
     * @throws SinoException {@code STICKER_PACK_NAME_TAKEN}, {@code STICKER_PACK_LIMIT_REACHED} (with {@code maxPacks})
     */
    public StickerPackSummary create(UUID ownerId, String name) {
        StickerPack draft = StickerPack.create(ownerId, name, clock.instant());
        try {
            return transaction.execute(status -> {
                refuseTakenName(ownerId, draft.name(), null);
                if (packs.countByOwnerId(ownerId) >= properties.maxPacksPerOwner()) {
                    throw new SinoException(StickerErrorCode.STICKER_PACK_LIMIT_REACHED,
                            "An owner has at most " + properties.maxPacksPerOwner() + " sticker packs.",
                            Map.of("maxPacks", properties.maxPacksPerOwner()));
                }
                return summaryOf(packs.saveAndFlush(draft), null);
            });
        } catch (DataIntegrityViolationException e) {
            throw takenAfterAll(ownerId, draft.name(), null).orElseThrow(() -> e);
        }
    }

    /**
     * Renames a pack of the owner; its stickers stay in it. A pack may take its own name in another case.
     *
     * @throws IllegalArgumentException when the name is blank or too long
     * @throws SinoException {@code STICKER_PACK_NOT_FOUND}, {@code STICKER_PACK_NAME_TAKEN}
     */
    public StickerPackSummary rename(UUID ownerId, UUID id, String name) {
        try {
            return transaction.execute(status -> {
                StickerPack pack = owned(ownerId, id);
                if (pack.rename(name)) {
                    refuseTakenName(ownerId, pack.name(), pack.id());
                    packs.flush();
                }
                return summaryOf(pack, contentsOf(ownerId).get(pack.id()));
            });
        } catch (DataIntegrityViolationException e) {
            throw takenAfterAll(ownerId, name.strip(), id).orElseThrow(() -> e);
        }
    }

    /**
     * Deletes a pack of the owner; its stickers stay in the library, in no pack (DN-1).
     *
     * @throws SinoException {@code STICKER_PACK_NOT_FOUND} when the owner has no such pack (also the second time)
     */
    @Transactional
    public void delete(UUID ownerId, UUID id) {
        if (packs.deleteOwned(id, ownerId) == 0) {
            throw notFound();
        }
    }

    private StickerPack owned(UUID ownerId, UUID id) {
        return packs.findByIdAndOwnerId(id, ownerId).orElseThrow(StickerPackService::notFound);
    }

    private Map<UUID, PackContents> contentsOf(UUID ownerId) {
        return stickers.packContents(ownerId).stream().collect(Collectors.toMap(PackContents::getPackId, Function.identity()));
    }

    private static StickerPackSummary summaryOf(StickerPack pack, PackContents contents) {
        return new StickerPackSummary(pack.id(), pack.name(), contents == null ? 0 : contents.getStickerCount(),
                contents == null ? null : contents.getCoverStickerId(), pack.createdAt());
    }

    /** Refuses a name that a pack of the owner other than {@code self} has, whatever its case. */
    private void refuseTakenName(UUID ownerId, String name, UUID self) {
        Optional<StickerPack> named = packs.findNamed(ownerId, name);
        if (named.isPresent() && !named.get().id().equals(self)) {
            throw nameTaken();
        }
    }

    /** After the index refused a write: the refusal names the pack that took the name, if one did. */
    private Optional<SinoException> takenAfterAll(UUID ownerId, String name, UUID self) {
        return transaction.execute(status -> packs.findNamed(ownerId, name))
                .filter(named -> !named.id().equals(self))
                .map(named -> nameTaken());
    }

    private static SinoException nameTaken() {
        return new SinoException(StickerErrorCode.STICKER_PACK_NAME_TAKEN, "Another sticker pack has this name.");
    }

    private static SinoException notFound() {
        // The same words for a pack of another owner and for one that does not exist.
        return new SinoException(StickerErrorCode.STICKER_PACK_NOT_FOUND, "There is no such sticker pack.");
    }

}
