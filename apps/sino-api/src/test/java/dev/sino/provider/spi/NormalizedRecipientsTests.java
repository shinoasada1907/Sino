package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.provider.spi.NormalizedRecipients.Address;

class NormalizedRecipientsTests {

    private static final Address AN = new Address("An", "an@example.com");
    private static final Address BINH = new Address(null, "binh@example.com");

    @Test
    void keepsEachListInOrderAndCannotBeChangedAfterwards() {
        List<Address> to = new ArrayList<>(List.of(AN, BINH));

        NormalizedRecipients recipients = new NormalizedRecipients(to, List.of(BINH), List.of(AN));
        to.clear();

        assertThat(recipients.to()).containsExactly(AN, BINH);
        assertThat(recipients.cc()).containsExactly(BINH);
        assertThat(recipients.replyTo()).containsExactly(AN);
    }

    @Test
    void aMissingListIsEmpty() {
        NormalizedRecipients recipients = new NormalizedRecipients(null, null, null);

        assertThat(recipients.to()).isEmpty();
        assertThat(recipients.cc()).isEmpty();
        assertThat(recipients.replyTo()).isEmpty();
    }

    @Test
    void rejectsAMissingAddressee() {
        assertRejectedAsInvalidPayload(() -> new NormalizedRecipients(Arrays.asList(AN, null), null, null));
        assertRejectedAsInvalidPayload(() -> new NormalizedRecipients(null, Arrays.asList((Address) null), null));
        assertRejectedAsInvalidPayload(() -> new NormalizedRecipients(null, null, Arrays.asList((Address) null)));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = " ")
    void anAddresseeNeedsAnAddress(String address) {
        assertRejectedAsInvalidPayload(() -> new Address("An", address));
    }

    @Test
    void aMessageWithoutRecipientsIsOneWhoseConnectorCannotTell() {
        NormalizedMessage message = new NormalizedMessage("m-1", "c-1", null, MessageDirection.INBOUND, null, "hi",
                null, false, null, java.time.Instant.parse("2026-10-01T08:00:00Z"), null, null, null);

        assertThat(message.recipients()).isNull();
    }

}
