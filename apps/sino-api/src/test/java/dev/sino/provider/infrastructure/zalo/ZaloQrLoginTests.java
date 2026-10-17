package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.delete;
import static com.github.tomakehurst.wiremock.client.WireMock.deleteRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.put;
import static com.github.tomakehurst.wiremock.client.WireMock.putRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.QrChallenge;
import dev.sino.provider.spi.QrLogin;
import dev.sino.provider.spi.QrLoginState;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Zalo's QR login (D-275) against a fake sino-zalo (WireMock): {@code POST /logins}, {@code GET /logins/{id}},
 * {@code DELETE /logins/{id}}, and the session it hands over once.
 */
class ZaloQrLoginTests {

    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String LOGIN = "/logins/0f8f2a52-3c6b-4c39-a1d2-6b1c0e8e8a11";
    private static final String LOGIN_ID = "0f8f2a52-3c6b-4c39-a1d2-6b1c0e8e8a11";
    private static final String COOKIE = "zpw-qr-done-cookie";
    private static final String SESSION = "{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"" + COOKIE + "\", "
            + "\"domain\": \".zalo.me\", \"maxAge\": 31536000, \"secure\": true}], \"imei\": \"imei-done-0001\", "
            + "\"userAgent\": \"Mozilla/5.0 (Sino test)\"}";

    private static WireMockServer sinoZalo;

    private QrLogin login;

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
    void forgetEarlierCalls() {
        sinoZalo.resetAll();
        login = zalo(true).qrLogin().orElseThrow();
    }

    @Test
    void startsALoginWithItsCode() {
        sinoZalo.stubFor(post(urlPathEqualTo("/logins")).withHeader("Authorization", equalTo("Bearer " + SECRET))
                .willReturn(aResponse().withStatus(201).withHeader("Content-Type", "application/json")
                        .withBody("{\"loginId\": \"" + LOGIN_ID + "\", \"qrImage\": \"iVBORw0KGgo=\", "
                                + "\"expiresAt\": \"2026-10-17T08:01:40.000Z\"}")));

        assertThat(login.start()).isEqualTo(new QrChallenge(LOGIN_ID, "iVBORw0KGgo=",
                Instant.parse("2026-10-17T08:01:40Z")));
    }

    // sino-zalo waits up to 15 s for Zalo's code: the start may take longer than a read is allowed to.
    @Test
    void waitsForTheCodeLongerThanForARead() {
        sinoZalo.stubFor(post(urlPathEqualTo("/logins")).willReturn(aResponse().withStatus(201)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"loginId\": \"" + LOGIN_ID + "\", \"qrImage\": \"iVBORw0KGgo=\", "
                        + "\"expiresAt\": \"2026-10-17T08:01:40.000Z\"}").withFixedDelay(1_200)));
        QrLogin slowCode = new ZaloQrLogin(new ZaloClient(URI.create(sinoZalo.baseUrl()), SECRET, true,
                Duration.ofSeconds(1), Duration.ofMillis(800), Duration.ofSeconds(2)));

        assertThat(slowCode.start().loginId()).isEqualTo(LOGIN_ID);
    }

    // QR_UNAVAILABLE: Zalo gave no code within 15 s, or failed first.
    @Test
    void noCodeFromZaloIsUnavailable() {
        sinoZalo.stubFor(post(urlPathEqualTo("/logins")).willReturn(aResponse().withStatus(502)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"code\": \"QR_UNAVAILABLE\", \"message\": \"Zalo did not give a QR code\"}")));

        assertThatExceptionOfType(ProviderException.class).isThrownBy(login::start)
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @ParameterizedTest
    @CsvSource({ "WAITING, Waiting", "EXPIRED, Expired", "DECLINED, Declined", "FAILED, Failed",
        "SOMETHING_NEW, Failed" })
    void tellsWhereTheLoginIs(String state, String expected) {
        sinoZalo.stubFor(get(urlPathEqualTo(LOGIN)).willReturn(okJson("{\"state\": \"" + state + "\"}")));

        assertThat(login.status(LOGIN_ID).getClass().getSimpleName()).isEqualTo(expected);
    }

    @Test
    void aScannedLoginSaysWhoScannedIt() {
        sinoZalo.stubFor(get(urlPathEqualTo(LOGIN))
                .willReturn(okJson("{\"state\": \"SCANNED\", \"displayName\": \"Lan Nguyễn\"}")));

        assertThat(login.status(LOGIN_ID)).isEqualTo(new QrLoginState.Scanned("Lan Nguyễn"));
    }

    @Test
    void aConfirmedLoginGivesTheAccountAndItsSession() {
        sinoZalo.stubFor(get(urlPathEqualTo(LOGIN)).willReturn(okJson("{\"state\": \"DONE\", \"profile\": "
                + "{\"ownId\": \"100000000000000001\", \"displayName\": \"Lan Nguyễn\", "
                + "\"avatarUrl\": \"https://s120-ava-talk.zadn.vn/a/b/c.jpg\"}, \"session\": " + SESSION + "}")));

        QrLoginState.Done done = (QrLoginState.Done) login.status(LOGIN_ID);

        assertThat(done.profile()).isEqualTo(new AccountProfile("100000000000000001", "Lan Nguyễn",
                "https://s120-ava-talk.zadn.vn/a/b/c.jpg", null));
        assertThat(done.credentials()).isInstanceOf(TokenCredentials.class);
        assertThat(done.toString()).doesNotContain(COOKIE);
    }

    // What sino-zalo gave at the login is what it gets back on every PUT session, as it was (D-274, D-289).
    @Test
    void theSessionGoesBackToSinoZaloAsItCame() {
        sinoZalo.stubFor(get(urlPathEqualTo(LOGIN)).willReturn(okJson("{\"state\": \"DONE\", \"profile\": "
                + "{\"ownId\": \"100000000000000001\", \"displayName\": \"Lan\", \"avatarUrl\": null}, "
                + "\"session\": " + SESSION + "}")));
        sinoZalo.stubFor(put(urlPathEqualTo("/accounts/7b0d1c1e-4f43-4a57-9d55-0e0d3a1f0b51/session"))
                .willReturn(aResponse().withStatus(204)));
        QrLoginState.Done done = (QrLoginState.Done) login.status(LOGIN_ID);
        ZaloClient client = new ZaloClient(URI.create(sinoZalo.baseUrl()), SECRET, true, Duration.ofSeconds(1),
                Duration.ofSeconds(2), Duration.ofSeconds(3));

        client.putSession(new ProviderContext(UUID.fromString("7b0d1c1e-4f43-4a57-9d55-0e0d3a1f0b51"),
                done.profile().externalAccountId(), done.credentials()));

        sinoZalo.verify(exactly(1), putRequestedFor(urlPathEqualTo(
                "/accounts/7b0d1c1e-4f43-4a57-9d55-0e0d3a1f0b51/session"))
                .withRequestBody(equalToJson("{\"session\": " + SESSION + "}")));
    }

    // sino-zalo leaves the name empty when Zalo never said who scanned: the account still needs one to be shown.
    @Test
    void aConfirmedLoginWithoutANameIsNamedByItsZaloId() {
        sinoZalo.stubFor(get(urlPathEqualTo(LOGIN)).willReturn(okJson("{\"state\": \"DONE\", \"profile\": "
                + "{\"ownId\": \"100000000000000001\", \"displayName\": \"\", \"avatarUrl\": null}, \"session\": "
                + SESSION + "}")));

        assertThat(((QrLoginState.Done) login.status(LOGIN_ID)).profile().displayName())
                .isEqualTo("100000000000000001");
    }

    // The account cannot be registered from half an answer; the user scans again.
    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "{\"state\": \"DONE\", \"session\": {\"cookie\": [], \"imei\": \"i\", \"userAgent\": \"u\"}}",
        "{\"state\": \"DONE\", \"profile\": {\"ownId\": \"100000000000000001\", \"displayName\": \"Lan\"}}",
        "{\"state\": \"DONE\", \"profile\": {\"ownId\": \" \", \"displayName\": \"Lan\"}, \"session\": {}}" })
    void aConfirmedLoginWithoutTheAccountOrItsSessionFails(String body) {
        sinoZalo.stubFor(get(urlPathEqualTo(LOGIN)).willReturn(okJson(body)));

        assertThat(login.status(LOGIN_ID)).isInstanceOf(QrLoginState.Failed.class);
    }

    // sino-zalo restarted, or forgot the login five minutes on: it is over.
    @Test
    void aLoginSinoZaloDoesNotKnowHasFailed() {
        sinoZalo.stubFor(get(urlPathEqualTo(LOGIN)).willReturn(aResponse().withStatus(404)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"code\": \"UNKNOWN_LOGIN\", \"message\": \"No such login\"}")));

        assertThat(login.status(LOGIN_ID)).isInstanceOf(QrLoginState.Failed.class);
    }

    @Test
    void aSinoZaloThatDoesNotAnswerIsUnavailable() {
        sinoZalo.stubFor(get(urlPathEqualTo(LOGIN)).willReturn(aResponse().withStatus(503)));

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> login.status(LOGIN_ID))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void cancelsTheLogin() {
        sinoZalo.stubFor(delete(urlPathEqualTo(LOGIN)).willReturn(aResponse().withStatus(204)));

        login.cancel(LOGIN_ID);

        sinoZalo.verify(exactly(1), deleteRequestedFor(urlPathEqualTo(LOGIN))
                .withHeader("Authorization", equalTo("Bearer " + SECRET)));
    }

    // The emergency switch (D-286): the connector still says it connects by QR code, and never calls sino-zalo.
    @Test
    void zaloTurnedOffCallsNothing() {
        QrLogin off = zalo(false).qrLogin().orElseThrow();

        assertThatExceptionOfType(ProviderException.class).isThrownBy(off::start)
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> off.status(LOGIN_ID))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> off.cancel(LOGIN_ID))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(sinoZalo.getAllServeEvents()).isEmpty();
    }

    private static ZaloProvider zalo(boolean enabled) {
        return new ZaloProvider(new ZaloProperties(enabled, URI.create(sinoZalo.baseUrl()), SECRET));
    }

}
