package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/** The picture of a message to send (D-349): checked where it is made, so no connector gets one it cannot send. */
class OutgoingImageTests {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 1, 2, 3};

    private static OutgoingImage picture() {
        return new OutgoingImage(PNG, "image/png", "sticker.png", 128, 96);
    }

    @Test
    void aPictureCarriesItsBytesTypeNameAndSize() {
        OutgoingImage image = picture();

        assertThat(image.bytes()).containsExactly(PNG);
        assertThat(image.mediaType()).isEqualTo("image/png");
        assertThat(image.fileName()).isEqualTo("sticker.png");
        assertThat(image.width()).isEqualTo(128);
        assertThat(image.height()).isEqualTo(96);
    }

    @Test
    void aPictureOwnsItsBytes() {
        byte[] given = PNG.clone();
        OutgoingImage image = new OutgoingImage(given, "image/png", "sticker.png", 128, 96);

        given[0] = 0;
        image.bytes()[1] = 0;

        assertThat(image.bytes()).containsExactly(PNG);
    }

    @Test
    void twoPicturesWithTheSameBytesAreEqual() {
        assertThat(picture()).isEqualTo(picture()).hasSameHashCodeAs(picture());
        assertThat(picture()).isNotEqualTo(new OutgoingImage(new byte[] {1}, "image/png", "sticker.png", 128, 96));
    }

    // The bytes are the user's picture: they never reach a log line through the record's text.
    @Test
    void itsTextSaysTheSizeAndNeverTheBytes() {
        String text = picture().toString();

        assertThat(text).contains("image/png", "sticker.png", "128", "96", String.valueOf(PNG.length));
        assertThat(text).doesNotContain(Arrays.toString(PNG)).doesNotContain("[B@");
    }

    @ParameterizedTest
    @CsvSource({"image/png,sticker.png", "image/gif,sticker.gif", "image/webp,sticker.webp"})
    void aPngGifOrWebpIsSendable(String mediaType, String fileName) {
        assertThat(new OutgoingImage(PNG, mediaType, fileName, 64, 64).mediaType()).isEqualTo(mediaType);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"image/jpeg", "image/svg+xml", "IMAGE/PNG", "text/plain", "png"})
    void anyOtherTypeIsRefused(String mediaType) {
        assertThatThrownBy(() -> new OutgoingImage(PNG, mediaType, "sticker.png", 64, 64))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("mediaType");
    }

    @Test
    void nothingOrMoreThanOneMebibyteIsRefused() {
        assertThatThrownBy(() -> new OutgoingImage(null, "image/png", "sticker.png", 64, 64))
                .isInstanceOf(NullPointerException.class).hasMessageContaining("bytes");
        assertThatThrownBy(() -> new OutgoingImage(new byte[0], "image/png", "sticker.png", 64, 64))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("bytes");
        assertThat(new OutgoingImage(new byte[OutgoingImage.MAX_BYTES], "image/png", "sticker.png", 64, 64).bytes())
                .hasSize(1024 * 1024);
        assertThatThrownBy(() -> new OutgoingImage(new byte[OutgoingImage.MAX_BYTES + 1], "image/png", "sticker.png", 64, 64))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("bytes");
    }

    @ParameterizedTest
    @CsvSource({"0,64", "-1,64", "64,0", "64,-5", "16385,64", "64,16385"})
    void aWidthOrHeightOutsideOneToSixteenThousandIsRefused(int width, int height) {
        assertThatThrownBy(() -> new OutgoingImage(PNG, "image/png", "sticker.png", width, height))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("size");
    }

    @Test
    void theLargestSizeIsAccepted() {
        OutgoingImage image = new OutgoingImage(PNG, "image/png", "sticker.png", 16384, 16384);

        assertThat(image.width()).isEqualTo(16384);
        assertThat(image.height()).isEqualTo(16384);
    }

    // sino-zalo takes the kind of a file from the end of its name (zca-js does the same for a GIF), and a name with a path
    // in it is a different file: the name has to agree with the type, and be only a name.
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "sticker", "sticker.jpg", "sticker.gif", "sticker.PNG", ".png", "   .png", "a/b.png",
            "a\\b.png", "../sticker.png", "a\nb.png"})
    void aNameThatIsNotAFileNameOfTheTypeIsRefused(String fileName) {
        assertThatThrownBy(() -> new OutgoingImage(PNG, "image/png", fileName, 64, 64))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("fileName");
    }

    @Test
    void aNameOfOneHundredCharactersIsTheLongest() {
        String longest = "a".repeat(96) + ".png";

        assertThat(new OutgoingImage(PNG, "image/png", longest, 64, 64).fileName()).hasSize(100);
        assertThatThrownBy(() -> new OutgoingImage(PNG, "image/png", "a" + longest, 64, 64))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("fileName");
    }

}
