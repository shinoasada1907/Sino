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
        NormalizedAttachment attachment = new NormalizedAttachment("a-1", null, null, null, null, null);

        assertThat(attachment.externalAttachmentId()).isEqualTo("a-1");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingId(String externalAttachmentId) {
        assertRejectedAsInvalidPayload(() -> new NormalizedAttachment(externalAttachmentId, "report.pdf",
                "application/pdf", 1024L, null, null));
    }

}
