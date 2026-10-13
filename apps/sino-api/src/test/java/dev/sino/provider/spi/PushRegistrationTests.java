package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class PushRegistrationTests {

    private static final Instant IN_A_WEEK = Instant.parse("2026-10-17T08:00:00Z");

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingAddress(String address) {
        assertRejectedAsInvalidPayload(() -> new PushRegistration(address, IN_A_WEEK));
    }

    @Test
    void rejectsAMissingExpiry() {
        assertRejectedAsInvalidPayload(() -> new PushRegistration("alice@example.com", null));
    }

    @Test
    void neverPrintsTheAddress() {
        PushRegistration registration = new PushRegistration("alice@example.com", IN_A_WEEK);

        assertThat(registration.toString()).doesNotContain("alice").contains(IN_A_WEEK.toString());
    }

}
