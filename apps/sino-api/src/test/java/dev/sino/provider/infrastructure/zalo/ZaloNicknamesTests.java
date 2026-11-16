package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.delete;
import static com.github.tomakehurst.wiremock.client.WireMock.deleteRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.put;
import static com.github.tomakehurst.wiremock.client.WireMock.putRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.URI;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;

import dev.sino.provider.ProviderCapability;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Nicknames of Zalo friends through sino-zalo (zalo-nicknames, NK-02, D-415, D-417), against WireMock: the contract
 * {@code PUT}/{@code DELETE}/{@code GET /accounts/:id/aliases(/:friendId)}, and the error table of D-415 reused
 * through {@link ZaloClient}'s existing mapping.
 */
class ZaloNicknamesTests {

    private static final UUID ACCOUNT_ID = UUID.fromString("3e7f8a10-2b4c-4d5e-9f60-1a2b3c4d5e71");
    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String ALIASES = "/accounts/" + ACCOUNT_ID + "/aliases";
    private static final String ALIAS_MOM = ALIASES + "/8001";
    private static final String SESSION = "/accounts/" + ACCOUNT_ID + "/session";
    private static final ProviderContext CONTEXT = new ProviderContext(ACCOUNT_ID, "100000000000000001",
            new TokenCredentials("{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"zpw-nick-cookie\"}], "
                    + "\"imei\": \"imei-nick\", \"userAgent\": \"Mozilla/5.0 (Sino nicknames test)\"}"));

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
    void theZaloConnectorDeclaresNicknames() {
        assertThat(zalo.capabilities().supports(ProviderCapability.NICKNAMES)).isTrue();
        assertThat(zalo.nicknames()).isPresent();
    }

    @Test
    void settingANicknamePutsTheAliasWithTheSharedSecret() {
        sinoZalo.stubFor(put(urlPathEqualTo(ALIAS_MOM)).willReturn(aResponse().withStatus(204)));

        zalo.nicknames().orElseThrow().set(CONTEXT, "8001", "Mẹ");

        sinoZalo.verify(putRequestedFor(urlPathEqualTo(ALIAS_MOM))
                .withHeader("Authorization", equalTo("Bearer " + SECRET))
                .withRequestBody(equalToJson("{\"alias\": \"Mẹ\"}")));
    }

    @ParameterizedTest
    @CsvSource({ "''", "'   '" })
    void settingABlankNicknameDeletesTheAliasInstead(String blank) {
        sinoZalo.stubFor(delete(urlPathEqualTo(ALIAS_MOM)).willReturn(aResponse().withStatus(204)));

        zalo.nicknames().orElseThrow().set(CONTEXT, "8001", blank);

        sinoZalo.verify(deleteRequestedFor(urlPathEqualTo(ALIAS_MOM)));
        assertThat(sinoZalo.getAllServeEvents()).hasSize(1);
    }

    @Test
    void clearingANullNicknameDeletesTheAlias() {
        sinoZalo.stubFor(delete(urlPathEqualTo(ALIAS_MOM)).willReturn(aResponse().withStatus(204)));

        zalo.nicknames().orElseThrow().set(CONTEXT, "8001", null);

        sinoZalo.verify(deleteRequestedFor(urlPathEqualTo(ALIAS_MOM)));
    }

    @Test
    void listingReadsEveryItemSinoZaloGives() {
        sinoZalo.stubFor(get(urlPathEqualTo(ALIASES)).willReturn(okJson("""
                {"items": [{"friendId": "8001", "alias": "Mẹ"}, {"friendId": "8002", "alias": "Ba"}]}
                """)));

        Map<String, String> aliases = zalo.nicknames().orElseThrow().list(CONTEXT);

        assertThat(aliases).containsExactlyInAnyOrderEntriesOf(Map.of("8001", "Mẹ", "8002", "Ba"));
    }

    @Test
    void anEmptyListIsAnEmptyMap() {
        sinoZalo.stubFor(get(urlPathEqualTo(ALIASES)).willReturn(okJson("{\"items\": []}")));

        assertThat(zalo.nicknames().orElseThrow().list(CONTEXT)).isEmpty();
    }

    // D-415: Zalo refusing the alias (not a friend, an invalid nickname) is 422, which ZaloClient already maps to
    // REQUEST_REJECTED for any call that is not a session or a send (D-281).
    @Test
    void zaloRefusingTheAliasIsRequestRejected() {
        sinoZalo.stubFor(put(urlPathEqualTo(ALIAS_MOM)).willReturn(error(422, "ALIAS_REJECTED")));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.nicknames().orElseThrow().set(CONTEXT, "8001", "Mẹ"))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.REQUEST_REJECTED);
    }

    @Test
    void sinoZaloFailingToAnswerIsProviderUnavailable() {
        sinoZalo.stubFor(get(urlPathEqualTo(ALIASES)).willReturn(aResponse().withStatus(502)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.nicknames().orElseThrow().list(CONTEXT))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    // D-277, D-289, D-423: the alias routes answer no live session (unknown account or an ended one) with one code,
    // 409 NO_SESSION (NK-01, unlike the message routes' 404/410); Sino hands the stored session over once and retries.
    @Test
    void settingWithoutASessionHandsTheSessionOverAndRetriesOnce() {
        sinoZalo.stubFor(put(urlPathEqualTo(ALIAS_MOM)).inScenario("alias").whenScenarioStateIs(STARTED)
                .willReturn(error(409, "NO_SESSION")).willSetStateTo("ready"));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION)).willReturn(aResponse().withStatus(204)));
        sinoZalo.stubFor(put(urlPathEqualTo(ALIAS_MOM)).inScenario("alias").whenScenarioStateIs("ready")
                .willReturn(aResponse().withStatus(204)));

        zalo.nicknames().orElseThrow().set(CONTEXT, "8001", "Mẹ");

        sinoZalo.verify(exactly(1), putRequestedFor(urlPathEqualTo(SESSION)));
        sinoZalo.verify(exactly(2), putRequestedFor(urlPathEqualTo(ALIAS_MOM)));
    }

    // A second 409 NO_SESSION after the session was handed over is not retried again (D-423).
    @Test
    void aSecondNoSessionAfterHandingItOverIsProviderUnavailable() {
        sinoZalo.stubFor(put(urlPathEqualTo(ALIAS_MOM)).willReturn(error(409, "NO_SESSION")));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION)).willReturn(aResponse().withStatus(204)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.nicknames().orElseThrow().set(CONTEXT, "8001", "Mẹ"))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        sinoZalo.verify(exactly(1), putRequestedFor(urlPathEqualTo(SESSION)));
        sinoZalo.verify(exactly(2), putRequestedFor(urlPathEqualTo(ALIAS_MOM)));
    }

    // The nickname never shows in a failure message (log hygiene, D-415: "log chỉ ID, không có tên gợi nhớ").
    @Test
    void aFailureNeverRepeatsTheNickname() {
        sinoZalo.stubFor(put(urlPathEqualTo(ALIAS_MOM)).willReturn(error(500, "BOOM")));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.nicknames().orElseThrow().set(CONTEXT, "8001", "Mẹ yêu quý"))
                .withMessageNotContaining("Mẹ yêu quý");
    }

    private static ResponseDefinitionBuilder error(int status, String code) {
        return aResponse().withStatus(status).withHeader("Content-Type", "application/json")
                .withBody("{\"code\": \"" + code + "\", \"message\": \"failure\"}");
    }

}
