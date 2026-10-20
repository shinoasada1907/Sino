package dev.sino.sticker.domain;

import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import org.springframework.data.domain.Persistable;

/**
 * The bytes of one sticker (D-331), in their own table {@code sticker_content} (V21), read only for the one sticker whose
 * picture is asked for. Its ID is the ID of the sticker, which exists first, so the ID is given and not generated;
 * {@link Persistable} tells Spring Data that a new one is new, instead of reading the table first to find out (which
 * would read bytes that are not there).
 */
@Entity
@Table(name = "sticker_content")
public class StickerContent implements Persistable<UUID> {

    @Id
    @Column(name = "sticker_id", nullable = false, updatable = false)
    private UUID stickerId;

    @Column(name = "content", nullable = false, updatable = false)
    private byte[] content;

    @Transient
    private boolean isNew = true;

    protected StickerContent() {
    }

    /** The bytes of the sticker with this ID; at least one. */
    public static StickerContent of(UUID stickerId, byte[] bytes) {
        Objects.requireNonNull(stickerId, "stickerId");
        Objects.requireNonNull(bytes, "bytes");
        if (bytes.length == 0) {
            throw new IllegalArgumentException("a sticker has at least one byte");
        }
        StickerContent content = new StickerContent();
        content.stickerId = stickerId;
        content.content = bytes.clone();
        return content;
    }

    public UUID stickerId() {
        return stickerId;
    }

    /** A copy of the bytes. */
    public byte[] bytes() {
        return content.clone();
    }

    @Override
    public UUID getId() {
        return stickerId;
    }

    @Override
    public boolean isNew() {
        return isNew;
    }

    @PostPersist
    @PostLoad
    void markKept() {
        isNew = false;
    }

}
