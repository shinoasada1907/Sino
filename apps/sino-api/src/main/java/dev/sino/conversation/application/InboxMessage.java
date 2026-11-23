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
 * {@code location} is the place a Zalo location message shares (zalo-location-card, D-530), null for any other.
 * {@code contactCard} is the person a Zalo contact card shares (zalo-location-card, D-530), null for any other.
 * {@code libraryStickerId} is the sticker of the user's library that a message Sino sent carries (ZS-05), null for any
 * other: the web shows it from {@code /api/stickers/{id}/content}, whatever address the provider gives its copy.
 * {@code reactions} are the emoji on the message, most people first (empty for none); {@code canReact} and {@code canQuote}
 * say whether the connector can react to and quote it (zalo-reactions D-387, zalo-quote-reply D-508); {@code quote} is
 * the message it answers, or null.
 */
public record InboxMessage(UUID id, MessageDirection direction, MessageStatus status, Instant sentAt, Sender sender,
        List<Address> to, List<Address> cc, String subject, String text, BodyFormat bodyFormat, boolean read,
        List<File> attachments, UUID clientMessageId, String sticker, StickerSprite stickerSprite, Image image,
        Location location, ContactCard contactCard, UUID libraryStickerId, List<Reaction> reactions, boolean canReact, Quote quote, boolean canQuote) {

    /**
     * One emoji on a message (zalo-reactions, D-387): the provider's {@code code}, its {@code emoji}, how many people
     * dropped it, whether the user did, and who (the user as "Bạn").
     */
    public record Reaction(String code, String emoji, int count, boolean mine, List<String> names) {
    }

    /**
     * The message this one answers (zalo-quote-reply): {@code messageId} is its ID in Sino, null when Sino does not hold
     * it, {@code senderName} who sent it ("Bạn" for the user) and {@code text} its first words or "Ảnh", "Sticker", the
     * name of a file.
     */
    public record Quote(UUID messageId, String senderName, String text) {
    }

    /** Frames side by side in one row of the sheet at {@code url}, one run of them lasting {@code durationMs}. */
    public record StickerSprite(String url, int frames, int durationMs) {
    }

    /**
     * The picture of a photo as its connector checked it: {@code url} the one to show, {@code thumbUrl} a smaller one
     * or null, {@code caption} the text the sender typed with it or null.
     */
    public record Image(String url, String thumbUrl, String caption) {
    }

    /**
     * A shared place: the coordinates (always valid), its {@code title} and {@code address} or null, the address of a map
     * picture the connector checked or null, and {@code current} when the sender shared where they are.
     */
    public record Location(double latitude, double longitude, String title, String address, String previewUrl,
            boolean current) {
    }

    /**
     * A shared person: the {@code name}, their picture, phone number and QR picture or null. {@code conversationId} is
     * the 1-1 chat the inbox already has with them in the account that got the card, as the inbox names it, or null;
     * it is found when the message is read, never stored. Their provider ID is not given out.
     */
    public record ContactCard(String name, String avatarUrl, String phone, String qrUrl, UUID conversationId) {
    }

    /** {@code address} is the email for mail, the provider's ID of the sender otherwise. */
    public record Sender(String name, String address, String avatarUrl, boolean self) {
        public Sender(String name, String address, boolean self) {
            this(name, address, null, self);
        }
    }

    public record Address(String name, String address) {
    }

    public record File(UUID id, String fileName, String mimeType, Long sizeBytes) {
    }

}

