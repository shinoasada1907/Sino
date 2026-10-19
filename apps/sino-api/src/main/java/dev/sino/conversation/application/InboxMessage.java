package dev.sino.conversation.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;

/**
 * One message of a conversation in the inbox (F06 design, Contract API). {@code sender} is null when the provider
 * named none; {@code to} and {@code cc} are null when Sino does not know the addressees, empty when there are none.
 * {@code clientMessageId} is the ID the web gave a message sent from Sino (F10), null for any other. {@code sticker} is
 * the address of a sticker's picture, as its connector checked it (NormalizedMessage.STICKER_URL), null for any other.
 * {@code stickerSprite} is the sprite sheet of a sticker that moves (ZL-15), null for a still sticker or any other message.
 * {@code image} is the picture of a photo (ZL-16), null for any other message and for a photo with no safe address.
 */
public record InboxMessage(UUID id, MessageDirection direction, MessageStatus status, Instant sentAt, Sender sender,
        List<Address> to, List<Address> cc, String subject, String text, BodyFormat bodyFormat, boolean read,
        List<File> attachments, UUID clientMessageId, String sticker, StickerSprite stickerSprite, Image image) {

    /** Frames side by side in one row of the sheet at {@code url}, one run of them lasting {@code durationMs}. */
    public record StickerSprite(String url, int frames, int durationMs) {
    }

    /**
     * The picture of a photo as its connector checked it: {@code url} the one to show, {@code thumbUrl} a smaller one
     * or null, {@code caption} the text the sender typed with it or null.
     */
    public record Image(String url, String thumbUrl, String caption) {
    }

    /** {@code address} is the email for mail, the provider's ID of the sender otherwise. */
    public record Sender(String name, String address, boolean self) {
    }

    public record Address(String name, String address) {
    }

    public record File(UUID id, String fileName, String mimeType, Long sizeBytes) {
    }

}
