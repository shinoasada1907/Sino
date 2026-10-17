package dev.sino.provider.infrastructure.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.provider.ProviderKind;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.TokenCredentials;

class ZaloProviderTests {

    private static final ZaloProperties PROPERTIES = new ZaloProperties(true, null,
            "sino-zalo-test-secret-0123456789abcdef");

    private final ZaloProvider zalo = new ZaloProvider(PROPERTIES);

    @Test
    void isZaloAChatProviderThatDoesNotConnectOverOAuth2() {
        assertThat(zalo.type()).isEqualTo(ProviderType.of("zalo"));
        assertThat(zalo.displayName()).isEqualTo("Zalo");
        assertThat(zalo.kind()).isEqualTo(ProviderKind.CHAT);
        assertThat(zalo.oauth2()).isEmpty();
    }

    // Each capability comes with the task that builds its operation: reading and push (ZL-08), sending (ZL-09).
    @Test
    void declaresNoCapabilityBeforeItsOperationsExist() {
        assertThat(zalo.capabilities().values()).isEmpty();
    }

    // Who the account is comes with the QR login (D-275), not from a call with credentials.
    @Test
    void doesNotLookUpWhoTheAccountIs() {
        ProviderContext context = new ProviderContext(UUID.randomUUID(), null,
                new TokenCredentials("{\"cookie\": [], \"imei\": \"imei\", \"userAgent\": \"agent\"}"));

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> zalo.getAccountProfile(context))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
    }

    // sino-zalo gives up on Zalo after 10 s and answers 504; Sino must still be listening then (D-280).
    @Test
    void waitsForASendLongerThanSinoZaloWaitsForZalo() {
        assertThat(ZaloProvider.SEND_TIMEOUT).isGreaterThan(Duration.ofSeconds(10));
        assertThat(ZaloProvider.SEND_TIMEOUT).isGreaterThan(ZaloProvider.READ_TIMEOUT);
    }

}
