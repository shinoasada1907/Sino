package dev.sino.sticker.domain;

import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.UuidGenerator;

/**
 * A pack of stickers of a Sino user (sticker-packs, D-340): a name that groups stickers, like the packs of Zalo. A
 * sticker is in at most one pack ({@link Sticker#packId()}). Mapped onto table {@code sticker_pack} (V22).
 * <p>
 * The name loses the whitespace at both ends and has 1 to {@value #MAX_NAME_LENGTH} code points, as the column counts.
 * That two packs of an owner have different names, whatever the case, is the service's and the database's to check.
 */
@Entity
@Table(name = "sticker_pack")
public class StickerPack {

    public static final int MAX_NAME_LENGTH = 50;

    @Id
    @UuidGenerator(style = UuidGenerator.Style.VERSION_7)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected StickerPack() {
    }

    /** @throws IllegalArgumentException when the name is blank or too long */
    public static StickerPack create(UUID ownerId, String name, Instant now) {
        StickerPack pack = new StickerPack();
        pack.ownerId = Objects.requireNonNull(ownerId, "ownerId");
        pack.name = checkedName(name);
        pack.createdAt = Objects.requireNonNull(now, "now");
        return pack;
    }

    /**
     * @return {@code false} when the pack already has this name; nothing changes then
     * @throws IllegalArgumentException when the name is blank or too long; the pack keeps its name then
     */
    public boolean rename(String name) {
        String newName = checkedName(name);
        if (newName.equals(this.name)) {
            return false;
        }
        this.name = newName;
        return true;
    }

    /**
     * What two names that may not be used together have in common: the name trimmed and in lower case, as the unique
     * index on {@code lower(name)} compares them.
     */
    public static String nameKey(String name) {
        return name.strip().toLowerCase(Locale.ROOT);
    }

    private static String checkedName(String name) {
        String trimmed = Objects.requireNonNull(name, "name").strip();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("a pack has a name");
        }
        if (trimmed.codePointCount(0, trimmed.length()) > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("the name of a pack is at most " + MAX_NAME_LENGTH + " characters");
        }
        return trimmed;
    }

    public UUID id() {
        return id;
    }

    public UUID ownerId() {
        return ownerId;
    }

    public String name() {
        return name;
    }

    public Instant createdAt() {
        return createdAt;
    }

}
