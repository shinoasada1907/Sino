package dev.sino.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import dev.sino.common.error.SinoException;
import dev.sino.provider.spi.OutgoingImage;
import dev.sino.sticker.StickerPictureForSending;

/**
 * The picture of a sticker of the library as the picture of a message to send (ZS-05, D-349): named by its type, never by
 * what the user called the sticker, and refused with a clear answer when a connector could not send it.
 */
class StickerImagesTests {

    private static final byte[] BYTES = {1, 2, 3, 4};

    @ParameterizedTest
    @CsvSource({"image/png,sticker.png", "image/gif,sticker.gif", "image/webp,sticker.webp"})
    void aStickerIsNamedByItsTypeAndKeepsItsBytesAndSize(String mediaType, String fileName) {
        OutgoingImage image = StickerImages.imageOf(new StickerPictureForSending(BYTES, mediaType, 60, 40));

        assertThat(image.fileName()).isEqualTo(fileName);
        assertThat(image.mediaType()).isEqualTo(mediaType);
        assertThat(image.bytes()).containsExactly(BYTES);
        assertThat(image.width()).isEqualTo(60);
        assertThat(image.height()).isEqualTo(40);
    }

    // The library can be set to keep stickers above the 1 MiB a message carries (sino.stickers.max-file-size): such a
    // sticker is a clear refusal, not an error of the server.
    @Test
    void aStickerLargerThanAMessageCarriesIsRefusedWithAClearAnswer() {
        StickerPictureForSending large = new StickerPictureForSending(new byte[OutgoingImage.MAX_BYTES + 1], "image/png",
                60, 40);

        assertThatThrownBy(() -> StickerImages.imageOf(large)).isInstanceOfSatisfying(SinoException.class, refused -> {
            assertThat(refused.errorCode()).isEqualTo(ConversationErrorCode.STICKER_NOT_SENDABLE);
            assertThat(refused.getMessage()).contains("1 MiB");
        });
    }

    @Test
    void aTypeThatCannotBeSentIsRefusedTheSameWay() {
        StickerPictureForSending jpeg = new StickerPictureForSending(BYTES, "image/jpeg", 60, 40);

        assertThatThrownBy(() -> StickerImages.imageOf(jpeg)).isInstanceOfSatisfying(SinoException.class,
                refused -> assertThat(refused.errorCode()).isEqualTo(ConversationErrorCode.STICKER_NOT_SENDABLE));
    }

}
