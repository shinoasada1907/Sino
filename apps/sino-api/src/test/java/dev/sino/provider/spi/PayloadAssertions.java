package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import org.assertj.core.api.ThrowableAssert.ThrowingCallable;

final class PayloadAssertions {

    private PayloadAssertions() {
    }

    static void assertRejectedAsInvalidPayload(ThrowingCallable creation) {
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(creation)
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

}
