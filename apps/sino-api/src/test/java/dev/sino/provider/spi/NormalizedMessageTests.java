package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class NormalizedMessageTests {

    private static final Instant SENT_AT = Instant.parse("2026-10-01T08:00:00Z");

    @Test
    void keepsValidData() {
        NormalizedMessage message = message("m-1", "c-1", MessageDirection.INBOUND, SENT_AT);

        assertThat(message.externalMessageId()).isEqualTo("m-1");
        assertThat(message.externalConversationId()).isEqualTo("c-1");
        assertThat(message.type()).isEqualTo(MessageType.TEXT);
        assertThat(message.status()).isEqualTo(MessageStatus.SENT);
        assertThat(message.sentAt()).isEqualTo(SENT_AT);
    }

    @Test
    void keepsExternalIdsAsGiven() {
        NormalizedMessage message = message(" m-1 ", "c-1", MessageDirection.INBOUND, SENT_AT);

        assertThat(message.externalMessageId()).isEqualTo(" m-1 ");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingMessageId(String externalMessageId) {
        assertRejectedAsInvalidPayload(() -> message(externalMessageId, "c-1", MessageDirection.INBOUND, SENT_AT));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingConversationId(String externalConversationId) {
        assertRejectedAsInvalidPayload(() -> message("m-1", externalConversationId, MessageDirection.INBOUND, SENT_AT));
    }

    @Test
    void rejectsAMissingDirection() {
        assertRejectedAsInvalidPayload(() -> message("m-1", "c-1", null, SENT_AT));
    }

    @Test
    void rejectsAMissingSentAt() {
        assertRejectedAsInvalidPayload(() -> message("m-1", "c-1", MessageDirection.INBOUND, null));
    }

    @Test
    void unmappedTypeAndStatusBecomeUnknown() {
        NormalizedMessage message = new NormalizedMessage("m-1", "c-1", null, MessageDirection.OUTBOUND, null,
                null, null, false, null, SENT_AT, null, null);

        assertThat(message.type()).isEqualTo(MessageType.UNKNOWN);
        assertThat(message.status()).isEqualTo(MessageStatus.UNKNOWN);
        assertThat(message.attachments()).isEmpty();
        assertThat(message.metadata()).isEmpty();
    }

    @Test
    void copiesAttachmentsAndMetadata() {
        List<NormalizedAttachment> attachments = new ArrayList<>(List.of(attachment("a-1")));
        Map<String, String> metadata = new HashMap<>(Map.of("labelIds", "INBOX"));
        NormalizedMessage message = new NormalizedMessage("m-1", "c-1", "alice", MessageDirection.INBOUND,
                MessageType.FILE, null, MessageStatus.DELIVERED, false, null, SENT_AT, attachments, metadata);

        attachments.add(attachment("a-2"));
        metadata.put("extra", "value");

        assertThat(message.attachments()).extracting(NormalizedAttachment::externalAttachmentId)
                .containsExactly("a-1");
        assertThat(message.metadata()).containsOnlyKeys("labelIds");
        assertThatThrownBy(() -> message.attachments().add(attachment("a-3")))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> message.metadata().put("extra", "value"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void rejectsANullAttachment() {
        List<NormalizedAttachment> attachments = new ArrayList<>();
        attachments.add(null);

        assertRejectedAsInvalidPayload(() -> new NormalizedMessage("m-1", "c-1", null, MessageDirection.INBOUND,
                MessageType.FILE, null, MessageStatus.SENT, false, null, SENT_AT, attachments, Map.of()));
    }

    @Test
    void rejectsANullMetadataValue() {
        Map<String, String> metadata = new HashMap<>();
        metadata.put("labelIds", null);

        assertRejectedAsInvalidPayload(() -> new NormalizedMessage("m-1", "c-1", null, MessageDirection.INBOUND,
                MessageType.TEXT, "hi", MessageStatus.SENT, false, null, SENT_AT, List.of(), metadata));
    }

    @Test
    void theErrorNamesTheFieldButNotTheValue() {
        assertThatThrownBy(() -> message("m-1", "   ", MessageDirection.INBOUND, SENT_AT))
                .hasMessage("externalConversationId must not be blank");
    }

    private static NormalizedMessage message(String externalMessageId, String externalConversationId,
            MessageDirection direction, Instant sentAt) {
        return new NormalizedMessage(externalMessageId, externalConversationId, "alice", direction,
                MessageType.TEXT, "hi", MessageStatus.SENT, false, null, sentAt, List.of(), Map.of());
    }

    private static NormalizedAttachment attachment(String externalAttachmentId) {
        return new NormalizedAttachment(externalAttachmentId, "report.pdf", "application/pdf", 1024L, null, null);
    }

}
