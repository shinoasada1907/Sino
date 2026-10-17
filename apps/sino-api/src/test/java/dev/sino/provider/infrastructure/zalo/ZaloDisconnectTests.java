package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.delete;
import static com.github.tomakehurst.wiremock.client.WireMock.deleteRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.noContent;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Disconnecting a personal Zalo account's session at {@code sino-zalo} and verifying the emergency off-switch across
 * all outbound connector operations (F09, ZL-10, D-284, D-286).
 */
class ZaloDisconnectTests {

    private static final UUID ACCOUNT_ID = UUID.fromString("3e7f8a10-2b4c-4d5e-9f60-1a2b3c4d5e6f");
    private static final UUID CLIENT_MESSAGE_ID = UUID.fromString("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b");
    private static final String OWN_ID = "100000000000000001";
    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String SESSION = "/accounts/" + ACCOUNT_ID + "/session";
    private static final String COOKIE_SECRET = "zpw-disconnect-cookie";
    private static final ProviderContext CONTEXT = new ProviderContext(ACCOUNT_ID, OWN_ID,
            new TokenCredentials("{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"" + COOKIE_SECRET + "\"}], "
                    + "\"imei\": \"imei-disconnect\", \"userAgent\": \"Mozilla/5.0 (Sino disconnect)\"}"));
    private static final SendMessageCommand COMMAND = new SendMessageCommand("200000000000000002",
            ConversationType.DIRECT, "Xin chào", "1001", List.of(), CLIENT_MESSAGE_ID, null);

    private static WireMockServer sinoZalo;

    private ZaloProvider zalo;

    @BeforeAll
    static void startSinoZalo() {
        sinoZalo = new WireMockServer(options().dynamicPort());
        sinoZalo.start();
    }

    @AfterAll
    static void stopSinoZalo() {
        sinoZalo.stop();
    }

    @BeforeEach
    void resetServer() {
        sinoZalo.resetAll();
        zalo = new ZaloProvider(new ZaloProperties(true, URI.create(sinoZalo.baseUrl()), SECRET));
    }

    @Test
    void disconnectDeletesTheAccountSessionAtSinoZalo() {
        sinoZalo.stubFor(delete(urlPathEqualTo(SESSION)).willReturn(noContent()));

        zalo.disconnect(CONTEXT);

        sinoZalo.verify(deleteRequestedFor(urlPathEqualTo(SESSION))
                .withHeader("Authorization", equalTo("Bearer " + SECRET)));
    }

    @Test
    void disconnectRequiresAnAccountId() {
        ProviderContext withoutAccountId = new ProviderContext(null, OWN_ID, CONTEXT.credentials());

        assertThatExceptionOfType(NullPointerException.class)
                .isThrownBy(() -> zalo.disconnect(withoutAccountId))
                .withMessage("A call to sino-zalo needs the account's ID");
        sinoZalo.verify(0, anyRequestedFor(anyUrl()));
    }

    @Test
    void disconnectTranslatesServerFailuresWithoutLeakingSecrets() {
        sinoZalo.stubFor(delete(urlPathEqualTo(SESSION)).willReturn(aResponse().withStatus(500)
                .withBody("internal error: " + SECRET + " " + COOKIE_SECRET)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.disconnect(CONTEXT))
                .satisfies(failure -> {
                    assertThat(failure.errorCode()).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
                    assertThat(failure.getMessage()).doesNotContain(SECRET).doesNotContain(COOKIE_SECRET);
                });
    }

    @Test
    void whenTurnedOffEveryCallToSinoZaloThrowsProviderUnavailableWithoutSendingAnyRequest() {
        ZaloProvider off = new ZaloProvider(new ZaloProperties(false, URI.create(sinoZalo.baseUrl()), SECRET));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> off.fetchUpdates(CONTEXT, SyncCursor.initial()))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> off.sendMessage(CONTEXT, COMMAND))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> off.findSentMessages(CONTEXT, COMMAND, Instant.parse("2026-10-17T08:00:00Z")))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> off.registerPush(CONTEXT))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> off.disconnect(CONTEXT))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> off.qrLogin().orElseThrow().start())
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> off.qrLogin().orElseThrow().status("login-1"))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> off.qrLogin().orElseThrow().cancel("login-1"))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);

        sinoZalo.verify(0, anyRequestedFor(anyUrl()));
    }

}
