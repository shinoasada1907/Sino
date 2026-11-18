package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.put;
import static com.github.tomakehurst.wiremock.client.WireMock.putRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.URI;
import java.util.List;
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
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.ReactCommand;
import dev.sino.provider.spi.ReactionKind;
import dev.sino.provider.spi.TokenCredentials;

/** Reacting to a Zalo message through sino-zalo (zalo-reactions, RX-05, D-381, D-388, D-389), against WireMock. */
class ZaloReactionTests {

    private static final UUID ACCOUNT_ID = UUID.fromString("3e7f8a10-2b4c-4d5e-9f60-1a2b3c4d5e6f");
    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String REACTIONS = "/accounts/" + ACCOUNT_ID + "/reactions";
    private static final String SESSION = "/accounts/" + ACCOUNT_ID + "/session";
    private static final ProviderContext CONTEXT = new ProviderContext(ACCOUNT_ID, "100000000000000001",
            new TokenCredentials("{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"zpw-react-cookie\"}], "
                    + "\"imei\": \"imei-react\", \"userAgent\": \"Mozilla/5.0 (Sino react)\"}"));
    private static final Map<String, String> META = Map.of("cliMsgId", "1747200000001");

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

    private static ReactCommand command(ConversationType type, Map<String, String> meta, String code) {
        return new ReactCommand("200000000000000002", type, "1001", meta, code);
    }

    @Test
    void zaloSaysItReacts() {
        assertThat(zalo.capabilities().supports(ProviderCapability.REACTIONS)).isTrue();
    }

    @Test
    void theSetStartsWithTheSixQuickReactionsInZalosOrder() {
        List<ReactionKind> set = zalo.reactionSet();

        assertThat(set.stream().filter(ReactionKind::quick).map(ReactionKind::code))
                .containsExactly("/-heart", ":>", ":o", ":-((", ":-h", "/-strong");
        assertThat(set.subList(0, 6)).allMatch(ReactionKind::quick);
        assertThat(set).extracting(ReactionKind::code).doesNotHaveDuplicates();
    }

    @Test
    void aMessageCanBeReactedToOnlyWithItsCliMsgId() {
        assertThat(zalo.canReact(META)).isTrue();
        assertThat(zalo.canReact(Map.of())).isFalse();
        assertThat(zalo.canReact(Map.of("cliMsgId", " "))).isFalse();
        assertThat(zalo.canReact(null)).isFalse();
    }

    @Test
    void aReactionIsSentWithTheCliMsgIdAndTheThreadType() {
        sinoZalo.stubFor(post(urlPathEqualTo(REACTIONS)).willReturn(aResponse().withStatus(204)));

        zalo.react(CONTEXT, command(ConversationType.GROUP, META, "/-heart"));

        sinoZalo.verify(exactly(1), postRequestedFor(urlPathEqualTo(REACTIONS))
                .withRequestBody(equalToJson("{\"threadId\": \"200000000000000002\", \"threadType\": \"GROUP\", "
                        + "\"msgId\": \"1001\", \"cliMsgId\": \"1747200000001\", \"icon\": \"/-heart\"}")));
    }

    @Test
    void aRemovalSendsAnEmptyIcon() {
        sinoZalo.stubFor(post(urlPathEqualTo(REACTIONS)).willReturn(aResponse().withStatus(204)));

        zalo.react(CONTEXT, command(ConversationType.DIRECT, META, ""));

        sinoZalo.verify(exactly(1), postRequestedFor(urlPathEqualTo(REACTIONS))
                .withRequestBody(equalToJson("{\"threadType\": \"USER\", \"icon\": \"\"}", true, true)));
    }

    @Test
    void aCodeOutsideTheSetIsRefusedBeforeSinoZaloIsCalled() {
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.react(CONTEXT, command(ConversationType.DIRECT, META, "/-nope")))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.REQUEST_REJECTED);
        sinoZalo.verify(exactly(0), postRequestedFor(urlPathEqualTo(REACTIONS)));
    }

    @Test
    void aMessageWithoutACliMsgIdIsRefusedBeforeSinoZaloIsCalled() {
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.react(CONTEXT, command(ConversationType.DIRECT, Map.of(), "/-heart")))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.REQUEST_REJECTED);
        sinoZalo.verify(exactly(0), postRequestedFor(urlPathEqualTo(REACTIONS)));
    }

    // D-281 holds for a reaction too: 429 is RATE_LIMITED, 422 REQUEST_REJECTED, 502 or 504 OUTCOME_UNKNOWN.
    @ParameterizedTest
    @CsvSource({
        "429, RATE_LIMITED, RATE_LIMITED",
        "422, REJECTED, REQUEST_REJECTED",
        "502, BAD_GATEWAY, OUTCOME_UNKNOWN",
        "504, TIMEOUT, OUTCOME_UNKNOWN"
    })
    void reactionFailuresFollowTheErrorMappingTable(int status, String zaloCode, ProviderErrorCode expected) {
        sinoZalo.stubFor(post(urlPathEqualTo(REACTIONS)).willReturn(error(status, zaloCode)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.react(CONTEXT, command(ConversationType.DIRECT, META, "/-heart")))
                .extracting(ProviderException::errorCode).isEqualTo(expected);
    }

    @ParameterizedTest
    @CsvSource({
        "404, UNKNOWN_ACCOUNT",
        "410, SESSION_ENDED"
    })
    void aReactionWithoutASessionHandsTheSessionOverAndTriesOnce(int status, String code) {
        sinoZalo.stubFor(post(urlPathEqualTo(REACTIONS)).inScenario("react").whenScenarioStateIs(STARTED)
                .willReturn(error(status, code)).willSetStateTo("ready"));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION)).willReturn(aResponse().withStatus(204)));
        sinoZalo.stubFor(post(urlPathEqualTo(REACTIONS)).inScenario("react").whenScenarioStateIs("ready")
                .willReturn(aResponse().withStatus(204)));

        zalo.react(CONTEXT, command(ConversationType.DIRECT, META, ":>"));

        sinoZalo.verify(exactly(1), putRequestedFor(urlPathEqualTo(SESSION)));
        sinoZalo.verify(exactly(2), postRequestedFor(urlPathEqualTo(REACTIONS)));
    }

    private static ResponseDefinitionBuilder error(int status, String code) {
        return aResponse().withStatus(status).withHeader("Content-Type", "application/json")
                .withBody("{\"code\": \"" + code + "\", \"message\": \"failure\"}");
    }

}
