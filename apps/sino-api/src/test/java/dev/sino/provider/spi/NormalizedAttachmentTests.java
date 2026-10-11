package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class NormalizedAttachmentTests {

    @Test
    void onlyTheIdIsRequired() {
        NormalizedAttachment attachment = new NormalizedAttachment("a-1", null, null, null, null, null, null);

        assertThat(attachment.externalAttachmentId()).isEqualTo("a-1");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingId(String externalAttachmentId) {
        assertRejectedAsInvalidPayload(() -> new NormalizedAttachment(externalAttachmentId, "report.pdf",
                "application/pdf", 1024L, null, null, null));
    }

    @ParameterizedTest
    @ValueSource(strings = { "image/png", "image/jpeg", "image/gif", "image/webp", "IMAGE/PNG",
            "image/jpeg; name=\"a.jpg\"", " image/gif " })
    void aPngJpegGifOrWebpIsAPictureInAnyCaseOrWithParameters(String mimeType) {
        assertThat(NormalizedAttachment.isPicture(mimeType)).isTrue();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = { "image/svg+xml", "image/tiff", "image/*", "*/*", "application/pdf", "text/html",
            "image/pngx" })
    void anythingElseIsNoPicture(String mimeType) {
        assertThat(NormalizedAttachment.isPicture(mimeType)).isFalse();
    }

}
