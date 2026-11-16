package dev.sino.sticker.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

/**
 * The limits of the sticker library, under {@code sino.stickers} (DN-1, D-333). The service checks them exactly; the
 * limit of the multipart upload in {@code application.yaml} is only a fence a little above {@code maxFileSize}.
 *
 * @param maxFileSize the largest file kept (1 MiB: {@code 1MB} is 1,048,576 bytes to Spring)
 * @param maxSide the largest width or height in pixels
 * @param maxPerOwner how many stickers one owner can keep
 * @param maxPacksPerOwner how many packs one owner can have (sticker-packs, DN-6)
 */
@ConfigurationProperties("sino.stickers")
public record StickerProperties(@DefaultValue("1MB") DataSize maxFileSize, @DefaultValue("1024") int maxSide,
        @DefaultValue("300") int maxPerOwner, @DefaultValue("50") int maxPacksPerOwner) {

    /** What the database takes at most (V21): nothing larger could be stored, so a larger limit would be a mistake. */
    static final long DATABASE_MAX_BYTES = 10L * 1024 * 1024;
    static final int DATABASE_MAX_SIDE = 16383;

    public StickerProperties {
        if (maxFileSize.toBytes() < 1 || maxFileSize.toBytes() > DATABASE_MAX_BYTES) {
            throw new IllegalArgumentException("sino.stickers.max-file-size must be between 1 byte and 10MB");
        }
        if (maxSide < 1 || maxSide > DATABASE_MAX_SIDE) {
            throw new IllegalArgumentException("sino.stickers.max-side must be between 1 and " + DATABASE_MAX_SIDE);
        }
        if (maxPerOwner < 1) {
            throw new IllegalArgumentException("sino.stickers.max-per-owner must be at least 1");
        }
        if (maxPacksPerOwner < 1) {
            throw new IllegalArgumentException("sino.stickers.max-packs-per-owner must be at least 1");
        }
    }

}
