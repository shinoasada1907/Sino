package dev.sino.sticker;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

/** The picture the sticker module hands to the module that sends it (D-350): the bytes are copied and never printed. */
class StickerPictureForSendingTests {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};

    @Test
    void ownsItsBytes() {
        byte[] given = PNG.clone();
        StickerPictureForSending picture = new StickerPictureForSending(given, "image/png", 60, 40);

        given[0] = 0;
        picture.bytes()[1] = 0;

        assertThat(picture.bytes()).containsExactly(PNG);
    }

    @Test
    void isEqualToAnotherWithTheSameBytesTypeAndSize() {
        StickerPictureForSending picture = new StickerPictureForSending(PNG, "image/png", 60, 40);

        assertThat(picture).isEqualTo(new StickerPictureForSending(PNG.clone(), "image/png", 60, 40))
                .hasSameHashCodeAs(new StickerPictureForSending(PNG.clone(), "image/png", 60, 40));
        assertThat(picture).isNotEqualTo(new StickerPictureForSending(new byte[] {1}, "image/png", 60, 40));
        assertThat(picture).isNotEqualTo(new StickerPictureForSending(PNG, "image/gif", 60, 40));
    }

    @Test
    void itsTextSaysTheSizeAndNeverTheBytes() {
        String text = new StickerPictureForSending(PNG, "image/png", 60, 40).toString();

        assertThat(text).contains("image/png", "60x40", String.valueOf(PNG.length));
        assertThat(text).doesNotContain(Arrays.toString(PNG)).doesNotContain("[B@");
    }

}
