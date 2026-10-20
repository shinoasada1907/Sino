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

    // On or off, Zalo says it connects by QR code; off, it cannot be connected now (D-286).
    @Test
    void connectsByQrCodeAndFollowsItsSwitch() {
        ZaloProvider off = new ZaloProvider(new ZaloProperties(false, null, null));

        assertThat(zalo.qrLogin()).isPresent();
        assertThat(zalo.turnedOn()).isTrue();
        assertThat(off.qrLogin()).isPresent();
        assertThat(off.turnedOn()).isFalse();
    }

    // Reading, sending and push are built in ZL-08 and ZL-09.
    @Test
    void declaresReadingSendingAndPushCapabilities() {
        assertThat(zalo.capabilities().values()).containsExactlyInAnyOrder(
                dev.sino.provider.ProviderCapability.READ_MESSAGES,
                dev.sino.provider.ProviderCapability.SEND_MESSAGES,
                dev.sino.provider.ProviderCapability.SEND_IMAGES,
                dev.sino.provider.ProviderCapability.PUSH_WEBHOOK);
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
        assertThat(ZaloProvider.SLOW_TIMEOUT).isGreaterThan(Duration.ofSeconds(10));
        assertThat(ZaloProvider.SLOW_TIMEOUT).isGreaterThan(ZaloProvider.READ_TIMEOUT);
    }

    // sino-zalo waits up to 15 s for Zalo to give a QR code, then answers 502 (ZL-02).
    @Test
    void waitsForAQrCodeLongerThanSinoZaloWaitsForZalo() {
        assertThat(ZaloProvider.SLOW_TIMEOUT).isGreaterThan(Duration.ofSeconds(15));
    }

}
