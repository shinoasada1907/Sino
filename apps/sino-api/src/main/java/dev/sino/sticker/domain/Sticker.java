package dev.sino.sticker.domain;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.UuidGenerator;

/**
 * A sticker in the library of a Sino user (custom-stickers): an image the user keeps, with what the application worked
 * out from the file. Only the metadata; the bytes are in {@link StickerContent}, so that reading a list of stickers never
 * reads an image (D-331). The picture of a sticker never changes once it is kept (to replace it, delete it and keep another); its name and its pack may (SP-03). Mapped onto
 * table {@code sticker} (V21; its pack, V22).
 * <p>
 * The limits that move with the configuration (size, side, how many) are the service's; here are the invariants the
 * database checks too, so that a caller that is not the REST layer cannot keep what the database would refuse. Lengths
 * count code points, as the column does (D-334). "Now" always comes from the caller.
 */
@Entity
@Table(name = "sticker")
public class Sticker {

    public static final int MAX_NAME_LENGTH = 50;

    @Id
    @UuidGenerator(style = UuidGenerator.Style.VERSION_7)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "name", nullable = false)
    private String name;

    @Convert(converter = StickerMediaTypeConverter.class)
    @Column(name = "media_type", nullable = false, updatable = false)
    private StickerMediaType mediaType;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, updatable = false)
    private StickerKind kind;

    @Column(name = "width", nullable = false, updatable = false)
    private int width;

    @Column(name = "height", nullable = false, updatable = false)
    private int height;

    @Column(name = "size_bytes", nullable = false, updatable = false)
    private long sizeBytes;

    /** The 32 bytes of the SHA-256 of the file: what makes two uploads of one file the same sticker (DN-2). */
    @Column(name = "sha256", nullable = false, updatable = false)
    private byte[] sha256;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** The pack the sticker is in, or {@code null} when it is in none yet (sticker-packs, D-340). */
    @Column(name = "pack_id")
    private UUID packId;

    protected Sticker() {
    }

    /**
     * A sticker of the owner from a file already read ({@link StickerImage#read}): its type, kind and size come from
     * the image, its size in bytes and its digest from the bytes.
     *
     * @param name already a name: not blank and at most {@value #MAX_NAME_LENGTH} code points
     */
    public static Sticker create(UUID ownerId, String name, StickerImage image, byte[] content, Instant now) {
        Sticker sticker = new Sticker();
        sticker.ownerId = Objects.requireNonNull(ownerId, "ownerId");
        sticker.name = checkedName(name);
        Objects.requireNonNull(image, "image");
        Objects.requireNonNull(content, "content");
        if (content.length == 0) {
            throw new IllegalArgumentException("a sticker has at least one byte");
        }
        sticker.mediaType = image.mediaType();
        sticker.kind = image.kind();
        sticker.width = image.width();
        sticker.height = image.height();
        sticker.sizeBytes = content.length;
        sticker.sha256 = sha256Of(content);
        sticker.createdAt = Objects.requireNonNull(now, "now");
        return sticker;
    }

    /**
     * Gives the sticker another name; its picture never changes.
     *
     * @param name already a name: not blank and at most {@value #MAX_NAME_LENGTH} code points
     */
    public void rename(String name) {
        this.name = checkedName(name);
    }

    /**
     * Puts the sticker in a pack, or in none for {@code null}. That the pack is the owner's is the service's to check,
     * and the database's (the foreign key covers the owner, D-340).
     */
    public void moveTo(UUID packId) {
        this.packId = packId;
    }

    private static String checkedName(String name) {
        Objects.requireNonNull(name, "name");
        if (name.isBlank()) {
            throw new IllegalArgumentException("a sticker has a name");
        }
        if (name.codePointCount(0, name.length()) > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("the name of a sticker is at most " + MAX_NAME_LENGTH + " characters");
        }
        return name;
    }

    private static byte[] sha256Of(byte[] content) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(content);
        } catch (NoSuchAlgorithmException e) {
            // Every Java platform has SHA-256 (it is required by the specification).
            throw new IllegalStateException(e);
        }
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

    public StickerMediaType mediaType() {
        return mediaType;
    }

    public StickerKind kind() {
        return kind;
    }

    public int width() {
        return width;
    }

    public int height() {
        return height;
    }

    public long sizeBytes() {
        return sizeBytes;
    }

    /** A copy: the digest of a kept sticker cannot be changed from outside. */
    public byte[] sha256() {
        return sha256.clone();
    }

    /** {@code null} when the sticker is in no pack. */
    public UUID packId() {
        return packId;
    }

    public Instant createdAt() {
        return createdAt;
    }

}
