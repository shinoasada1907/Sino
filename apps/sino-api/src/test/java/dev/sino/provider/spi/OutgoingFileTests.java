package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import dev.sino.provider.spi.OutgoingFile.Kind;

// zalo-send-files, D-371, D-372: what a picture or file from the computer must be before a connector gets it.
class OutgoingFileTests {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2, 3};
    private static final byte[] PDF = "%PDF-1.7".getBytes(StandardCharsets.US_ASCII);

    @Test
    void aPhotoIsAPictureNamedAsItsType() {
        OutgoingFile photo = new OutgoingFile(JPEG, "image/jpeg", "chup.jpg", Kind.PHOTO);

        assertThat(photo.kind()).isEqualTo(Kind.PHOTO);
        assertThat(new OutgoingFile(JPEG, "image/png", "Man hinh.PNG", Kind.PHOTO).fileName()).isEqualTo("Man hinh.PNG");
    }

    @Test
    void aPhotoMustBeAPictureWhoseNameEndsAsItsTypeDoes() {
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(JPEG, "image/jpeg", "chup.png", Kind.PHOTO));
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(PDF, "application/pdf", "a.pdf", Kind.PHOTO));
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(JPEG, "image/heic", "a.heic", Kind.PHOTO));
    }

    // zca-js would take a file named as a picture for one and send it down the photo path.
    @Test
    void aFileThatIsNoPhotoMustNotBeNamedAsAPicture() {
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(PDF, "text/plain", "ghi-chu.jpg", Kind.FILE));
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(PDF, "text/plain", "ghi-chu.JPEG", Kind.FILE));

        assertThat(new OutgoingFile(PDF, "application/octet-stream", "ghi-chu.jpg.bin", Kind.FILE).fileName())
                .isEqualTo("ghi-chu.jpg.bin");
        assertThat(new OutgoingFile(PDF, "application/pdf", "bao cao (1).pdf", Kind.FILE).kind()).isEqualTo(Kind.FILE);
    }

    @Test
    void aPhotoWeighsUpTo10MiBAndAFileUpTo25MiB() {
        byte[] tenMiB = new byte[OutgoingFile.MAX_PHOTO_BYTES];
        byte[] overTenMiB = new byte[OutgoingFile.MAX_PHOTO_BYTES + 1];

        assertThat(new OutgoingFile(tenMiB, "image/png", "a.png", Kind.PHOTO).bytes()).hasSize(tenMiB.length);
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(overTenMiB, "image/png", "a.png", Kind.PHOTO));
        assertThat(new OutgoingFile(overTenMiB, "application/zip", "a.zip", Kind.FILE).bytes()).hasSize(overTenMiB.length);
        assertThat(new OutgoingFile(new byte[OutgoingFile.MAX_FILE_BYTES], "application/zip", "a.zip", Kind.FILE).bytes())
                .hasSize(OutgoingFile.MAX_FILE_BYTES);
        assertThatIllegalArgumentException().isThrownBy(
                () -> new OutgoingFile(new byte[OutgoingFile.MAX_FILE_BYTES + 1], "application/zip", "a.zip", Kind.FILE));
    }

    @Test
    void anEmptyFileIsRefused() {
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(new byte[0], "text/plain", "a.txt", Kind.FILE));
    }

    @Test
    void theNameIsOnlyAName() {
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(PDF, "application/pdf", "../a.pdf", Kind.FILE));
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(PDF, "application/pdf", "c:\\a.pdf", Kind.FILE));
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(PDF, "application/pdf", "a\nb.pdf", Kind.FILE));
        assertThatIllegalArgumentException().isThrownBy(() -> new OutgoingFile(PDF, "application/pdf", " ", Kind.FILE));
        assertThatIllegalArgumentException().isThrownBy(
                () -> new OutgoingFile(PDF, "application/pdf", "a".repeat(252) + ".pdf", Kind.FILE));
        assertThat(new OutgoingFile(PDF, "application/pdf", "a".repeat(251) + ".pdf", Kind.FILE).fileName()).hasSize(255);
    }

    @Test
    void theBytesAreCopiedInAndOutAndNeverPrinted() {
        byte[] given = PDF.clone();
        OutgoingFile file = new OutgoingFile(given, "application/pdf", "bi-mat.pdf", Kind.FILE);

        given[0] = 0;
        file.bytes()[1] = 0;

        assertThat(file.bytes()).isEqualTo(PDF);
        assertThat(file).isEqualTo(new OutgoingFile(PDF, "application/pdf", "bi-mat.pdf", Kind.FILE));
        assertThat(file.toString()).contains("bytes=8").doesNotContain("PDF-1.7").doesNotContain("bi-mat");
    }

}
