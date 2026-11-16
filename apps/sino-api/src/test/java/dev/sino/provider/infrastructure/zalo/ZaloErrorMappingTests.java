package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.absent;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.put;
import static com.github.tomakehurst.wiremock.client.WireMock.putRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.io.IOException;
import java.net.ConnectException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.web.client.ResourceAccessException;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.http.Fault;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Conversation;
import dev.sino.provider.infrastructure.zalo.ZaloClient.LookupRequest;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.infrastructure.zalo.ZaloClient.MessagePage;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Participant;
import dev.sino.provider.infrastructure.zalo.ZaloClient.SendRequest;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Sent;
import dev.sino.provider.infrastructure.zalo.ZaloClient.ThreadType;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.TokenCredentials;

/**
 * {@link ZaloClient} against a fake sino-zalo (WireMock) on a real HTTP port: each row of the error table D-281, and
 * the session handed over again once when sino-zalo has none or an ended one (D-277, D-289).
 */
@ExtendWith(OutputCaptureExtension.class)
class ZaloErrorMappingTests {

    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String COOKIE = "zpw-test-cookie-value-42";
    private static final String SESSION = "{\"cookie\":[{\"key\":\"zpw_sek\",\"value\":\"" + COOKIE + "\"}],"
            + "\"imei\":\"imei-test-0001\",\"userAgent\":\"Mozilla/5.0 (Sino test)\"}";
    private static final UUID ACCOUNT = UUID.fromString("7b0d1c1e-4f43-4a57-9d55-0e0d3a1f0b51");
    private static final ProviderContext CONTEXT = new ProviderContext(ACCOUNT, "100000000000000001",
            new TokenCredentials(SESSION));
    private static final String MESSAGES = "/accounts/" + ACCOUNT + "/messages";
    private static final String SESSION_PATH = "/accounts/" + ACCOUNT + "/session";
    private static final String LOOKUP = "/accounts/" + ACCOUNT + "/sent/lookup";
    private static final String CLIENT_MESSAGE_ID = "6f1c2b9e-1d1a-4b8e-9a51-3f4d2a7c8e10";
    private static final SendRequest SEND = new SendRequest("g-1", ThreadType.GROUP, "Ok mình tới", CLIENT_MESSAGE_ID);
    private static final LookupRequest LOOK = new LookupRequest("g-1", CLIENT_MESSAGE_ID, "Ok mình tới",
            Instant.parse("2026-10-17T08:00:00Z"));
    private static final Duration READ_TIMEOUT = Duration.ofMillis(800);
    private static final Duration SEND_TIMEOUT = Duration.ofMillis(2_000);
    private static final String PAGE = """
            {"conversations": [{"threadId": "g-1", "threadType": "GROUP", "title": "Gia đình", "avatarUrl": null,
                                "participants": [{"id": "u-2", "name": "Mẹ"}]}],
             "messages": [{"msgId": "8372265733130", "threadId": "g-1", "threadType": "GROUP", "fromId": "u-2",
                           "fromName": "Mẹ", "isSelf": false, "zaloType": "webchat", "text": "Tối về ăn cơm nhé",
                           "sentAt": "2026-10-17T08:00:00.000Z"},
                          {"msgId": "8372265733131", "threadId": "g-1", "threadType": "GROUP", "fromId": "u-1",
                           "fromName": "Tôi", "isSelf": true, "zaloType": "chat.photo", "text": null,
                           "sentAt": "2026-10-17T08:00:05.000Z"}],
             "nextCursor": "8372265733131", "hasMore": true}
            """;

    private static WireMockServer sinoZalo;

    private ZaloClient client;

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
        client = clientOf(URI.create(sinoZalo.baseUrl()), true);
    }

    @Test
    void readsThePageAfterTheCursorWithTheSecret() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).withQueryParam("after", equalTo("8372251986275"))
                .withQueryParam("limit", equalTo("100")).withHeader("Authorization", equalTo("Bearer " + SECRET))
                .willReturn(okJson(PAGE)));

        MessagePage page = client.messages(CONTEXT, "8372251986275", 100);

        assertThat(page.conversations()).containsExactly(new Conversation("g-1", "GROUP", "Gia đình", null,
                List.of(new Participant("u-2", "Mẹ"))));
        assertThat(page.messages()).containsExactly(
                new Message("8372265733130", "g-1", "GROUP", "u-2", "Mẹ", false, "webchat", "Tối về ăn cơm nhé",
                        "2026-10-17T08:00:00.000Z"),
                new Message("8372265733131", "g-1", "GROUP", "u-1", "Tôi", true, "chat.photo", null,
                        "2026-10-17T08:00:05.000Z"));
        assertThat(page.nextCursor()).isEqualTo("8372265733131");
        assertThat(page.hasMore()).isTrue();
    }

    @Test
    void theFirstReadSendsNoCursor() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).withQueryParam("after", absent())
                .willReturn(okJson("{\"conversations\": [], \"messages\": [], \"nextCursor\": null, \"hasMore\": false}")));

        MessagePage page = client.messages(CONTEXT, null, 100);

        assertThat(page.conversations()).isEmpty();
        assertThat(page.messages()).isEmpty();
        assertThat(page.nextCursor()).isNull();
        assertThat(page.hasMore()).isFalse();
    }

    // sino-zalo restarted (404) or still holds a session Zalo ended while Sino has a newer one (410): it is given the
    // stored session, then asked again, once (D-277, D-289).
    @ParameterizedTest
    @CsvSource({ "404, UNKNOWN_ACCOUNT", "410, SESSION_ENDED" })
    void aReadWithoutTheSessionHandsItOverAndReadsAgain(int status, String code) {
        answerReadsWith(error(status, code), okJson(PAGE));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(aResponse().withStatus(204)));

        MessagePage page = client.messages(CONTEXT, "8372251986275", 100);

        assertThat(page.messages()).hasSize(2);
        sinoZalo.verify(exactly(1), putRequestedFor(urlPathEqualTo(SESSION_PATH))
                .withHeader("Authorization", equalTo("Bearer " + SECRET))
                .withRequestBody(equalToJson("{\"session\": " + SESSION + "}")));
        sinoZalo.verify(exactly(2), getRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    // The stored session is the one Zalo ended: the user must scan the QR code again.
    @Test
    void aSessionThatStaysEndedIsExpired() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(error(410, "SESSION_ENDED")));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(error(410, "SESSION_ENDED")));

        assertFails(() -> client.messages(CONTEXT, "8372251986275", 100), ProviderErrorCode.AUTH_EXPIRED);
        sinoZalo.verify(exactly(1), getRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    @ParameterizedTest
    @CsvSource({ "404, UNKNOWN_ACCOUNT, PROVIDER_UNAVAILABLE", "410, SESSION_ENDED, AUTH_EXPIRED" })
    void handsTheSessionOverOnlyOnce(int status, String code, ProviderErrorCode expected) {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(error(status, code)));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(aResponse().withStatus(204)));

        assertFails(() -> client.messages(CONTEXT, "8372251986275", 100), expected);
        sinoZalo.verify(exactly(1), putRequestedFor(urlPathEqualTo(SESSION_PATH)));
        sinoZalo.verify(exactly(2), getRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    // Another scan gives a session that works; repeating the call cannot. Logged with sino-zalo's code, in case Sino
    // itself built the body wrong.
    @Test
    void aStoredSessionSinoZaloCannotUseIsExpired(CapturedOutput output) {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(error(404, "UNKNOWN_ACCOUNT")));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(aResponse().withStatus(400)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"code\": \"FST_ERR_VALIDATION\", \"message\": \"body/session must have imei\"}")));

        assertFails(() -> client.messages(CONTEXT, "8372251986275", 100), ProviderErrorCode.AUTH_EXPIRED);
        assertThat(output).contains("WARN").contains("FST_ERR_VALIDATION").doesNotContain(COOKIE);
    }

    // The JDK refuses such a header with the header, secret and all, in its message.
    @Test
    void aSecretThatCannotGoInAHeaderNeverReachesAMessage() {
        String secret = "đ".repeat(32);
        ZaloClient unusable = new ZaloClient(URI.create(sinoZalo.baseUrl()), secret, true, Duration.ofSeconds(1),
                READ_TIMEOUT, SEND_TIMEOUT);

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> unusable.messages(CONTEXT, null, 100))
                .satisfies(failure -> {
                    assertThat(failure.errorCode()).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
                    assertThat(failure.getMessage()).doesNotContain(secret);
                    assertThat(failure.getCause()).isNull();
                });
        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> unusable.send(CONTEXT, SEND))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(sinoZalo.getAllServeEvents()).isEmpty();
    }

    @Test
    void aStoredSessionThatIsNotJsonIsExpiredWithoutCallingSinoZalo() {
        ProviderContext broken = new ProviderContext(ACCOUNT, "100000000000000001",
                new TokenCredentials("not-a-zalo-session-" + COOKIE));

        assertFails(() -> client.putSession(broken), ProviderErrorCode.AUTH_EXPIRED);
        assertThat(sinoZalo.getAllServeEvents()).isEmpty();
    }

    @Test
    void zaloNotAnsweringTheSessionIsUnavailable() {
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(error(502, "ZALO_UNAVAILABLE")));

        assertFails(() -> client.putSession(CONTEXT), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @ParameterizedTest
    @ValueSource(ints = { 500, 502, 503 })
    void aServerErrorOnAReadIsUnavailable(int status) {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(aResponse().withStatus(status)));

        assertFails(() -> client.messages(CONTEXT, null, 100), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void aReadWithoutAnAnswerInTimeIsUnavailable() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(okJson(PAGE).withFixedDelay(1_500)));

        assertFails(() -> client.messages(CONTEXT, null, 100), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void aReadThatBreaksOffIsUnavailable() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)));

        assertFails(() -> client.messages(CONTEXT, null, 100), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void sinoZaloNotRunningIsUnavailable() throws IOException {
        ZaloClient nobody = clientOf(URI.create("http://127.0.0.1:" + closedPort()), true);

        assertFails(() -> nobody.messages(CONTEXT, null, 100), ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertFails(() -> nobody.putSession(CONTEXT), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void anAnswerSinoCannotReadFailsTheRead() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(okJson("[\"not a page\"]")));

        assertFails(() -> client.messages(CONTEXT, null, 100), ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    // The two services were given different secrets: a setup mistake to fix, not a reason to give up the account.
    @Test
    void aRefusedSecretIsUnavailableAndAnError(CapturedOutput output) {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(error(401, "UNAUTHORIZED")));

        assertFails(() -> client.messages(CONTEXT, null, 100), ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(output).contains("ERROR").contains("SINO_ZALO_SECRET").doesNotContain(SECRET);
    }

    // Any 404 but sino-zalo's own UNKNOWN_ACCOUNT is a route it does not have: handing the session over cannot help.
    @Test
    void anyOtherRefusalIsARejection() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).willReturn(aResponse().withStatus(404)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"message\": \"Route GET:/accounts not found\", \"error\": \"Not Found\", \"statusCode\": 404}")));
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).willReturn(aResponse().withStatus(400)));

        assertFails(() -> client.messages(CONTEXT, null, 100), ProviderErrorCode.REQUEST_REJECTED);
        assertFails(() -> client.lookup(CONTEXT, LOOK), ProviderErrorCode.REQUEST_REJECTED);
        sinoZalo.verify(exactly(0), putRequestedFor(urlPathEqualTo(SESSION_PATH)));
    }

    @Test
    void sendsTheTextAndGivesZalosId() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).withHeader("Authorization", equalTo("Bearer " + SECRET))
                .withRequestBody(equalToJson("{\"threadId\": \"g-1\", \"threadType\": \"GROUP\", "
                        + "\"text\": \"Ok mình tới\", \"clientMessageId\": \"" + CLIENT_MESSAGE_ID + "\"}"))
                .willReturn(aResponse().withStatus(201).withHeader("Content-Type", "application/json")
                        .withBody("{\"msgId\": \"8372265733140\", \"sentAt\": \"2026-10-17T08:01:00.000Z\"}")));

        Sent sent = client.send(CONTEXT, SEND);

        assertThat(sent).isEqualTo(new Sent("8372265733140", Instant.parse("2026-10-17T08:01:00Z")));
    }

    // The same clientMessageId again: sino-zalo answers 200 with what it sent the first time.
    @Test
    void takesThe200OfARepeatedSend() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES))
                .willReturn(okJson("{\"msgId\": \"8372265733140\", \"sentAt\": \"2026-10-17T08:01:00.000Z\"}")));

        assertThat(client.send(CONTEXT, SEND).msgId()).isEqualTo("8372265733140");
    }

    // Zalo may have the message: Sino asks later instead of sending it twice (D-135, D-281).
    @ParameterizedTest
    @CsvSource({ "504, OUTCOME_UNKNOWN", "500, INTERNAL", "502, BAD_GATEWAY" })
    void aSendThatMayHaveGoneIsUnknownAndNotRepeated(int status, String code) {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(error(status, code)));

        assertFails(() -> client.send(CONTEXT, SEND), ProviderErrorCode.OUTCOME_UNKNOWN);
        sinoZalo.verify(exactly(1), postRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    @Test
    void aSendWithoutAnAnswerInTimeIsUnknown() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(aResponse().withStatus(201)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"msgId\": \"8372265733140\", \"sentAt\": \"2026-10-17T08:01:00.000Z\"}")
                .withFixedDelay(3_000)));

        assertFails(() -> client.send(CONTEXT, SEND), ProviderErrorCode.OUTCOME_UNKNOWN);
        sinoZalo.verify(exactly(1), postRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    @Test
    void aSendThatBreaksOffIsUnknown() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)));

        assertFails(() -> client.send(CONTEXT, SEND), ProviderErrorCode.OUTCOME_UNKNOWN);
    }

    @Test
    void aSendAcceptedWithoutAnIdIsUnknown() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(aResponse().withStatus(201)
                .withHeader("Content-Type", "application/json").withBody("{\"sentAt\": \"2026-10-17T08:01:00.000Z\"}")));

        assertFails(() -> client.send(CONTEXT, SEND), ProviderErrorCode.OUTCOME_UNKNOWN);
    }

    // A send slower than a read but within the send's own limit, which is above the 10 s sino-zalo waits (D-280).
    @Test
    void aSendWaitsLongerThanARead() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(aResponse().withStatus(201)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"msgId\": \"8372265733140\", \"sentAt\": \"2026-10-17T08:01:00.000Z\"}")
                .withFixedDelay(1_200)));

        assertThat(client.send(CONTEXT, SEND).msgId()).isEqualTo("8372265733140");
    }

    @Test
    void aSendThatCannotReachSinoZaloLeftNothing() throws IOException {
        ZaloClient nobody = clientOf(URI.create("http://127.0.0.1:" + closedPort()), true);

        assertFails(() -> nobody.send(CONTEXT, SEND), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Only a connection never made proves nothing left; on Windows a refused port shows as a connect timeout.
    @Test
    void tellsASendThatNeverLeftFromOneThatMayHave() {
        assertThat(ZaloClient.sendFailure(new ResourceAccessException("x", new ConnectException("refused"))))
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(ZaloClient.sendFailure(new ResourceAccessException("x", new HttpConnectTimeoutException("slow"))))
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(ZaloClient.sendFailure(new ResourceAccessException("x", new UnknownHostException("sino-zalo"))))
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(ZaloClient.sendFailure(new ResourceAccessException("x", new HttpTimeoutException("no answer"))))
                .isEqualTo(ProviderErrorCode.OUTCOME_UNKNOWN);
    }

    @ParameterizedTest
    @CsvSource({ "400, FST_ERR_VALIDATION, REQUEST_REJECTED", "401, UNAUTHORIZED, PROVIDER_UNAVAILABLE" })
    void aSendRefusedBeforeZaloLeavesItUnsent(int status, String code, ProviderErrorCode expected) {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(error(status, code)));

        assertFails(() -> client.send(CONTEXT, SEND), expected);
        sinoZalo.verify(exactly(1), postRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    // Handing the session over fails: the send is not tried a second time.
    @ParameterizedTest
    @CsvSource({ "410, SESSION_ENDED, AUTH_EXPIRED", "502, ZALO_UNAVAILABLE, PROVIDER_UNAVAILABLE" })
    void aSendWhoseSessionCannotComeBackIsNotSent(int status, String code, ProviderErrorCode expected) {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(error(410, "SESSION_ENDED")));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(error(status, code)));

        assertFails(() -> client.send(CONTEXT, SEND), expected);
        sinoZalo.verify(exactly(1), postRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    @Test
    void moreThanOneMessageASecondIsThrottled() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(error(429, "RATE_LIMITED")));

        assertFails(() -> client.send(CONTEXT, SEND), ProviderErrorCode.RATE_LIMITED);
    }

    @Test
    void aMessageZaloRefusedIsRejected() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(error(422, "REJECTED")));

        assertFails(() -> client.send(CONTEXT, SEND), ProviderErrorCode.REQUEST_REJECTED);
    }

    // Without a session nothing was sent, so sending again after handing it over cannot send twice.
    @Test
    void aSendWithoutTheSessionIsSentOnceItIsBack() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).inScenario("send").whenScenarioStateIs(STARTED)
                .willReturn(error(404, "UNKNOWN_ACCOUNT")).willSetStateTo("again"));
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).inScenario("send").whenScenarioStateIs("again")
                .willReturn(aResponse().withStatus(201).withHeader("Content-Type", "application/json")
                        .withBody("{\"msgId\": \"8372265733140\", \"sentAt\": \"2026-10-17T08:01:00.000Z\"}")));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(aResponse().withStatus(204)));

        assertThat(client.send(CONTEXT, SEND).msgId()).isEqualTo("8372265733140");
        sinoZalo.verify(exactly(2), postRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    @Test
    void findsTheIdsOfASentMessage() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).withRequestBody(equalToJson("{\"threadId\": \"g-1\", "
                + "\"clientMessageId\": \"" + CLIENT_MESSAGE_ID + "\", \"text\": \"Ok mình tới\", "
                + "\"after\": \"2026-10-17T08:00:00Z\"}"))
                .willReturn(okJson("{\"msgIds\": [\"8372265733140\"]}")));

        assertThat(client.lookup(CONTEXT, LOOK)).containsExactly("8372265733140");
    }

    @Test
    void nothingFoundIsAnEmptyList() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).willReturn(okJson("{\"msgIds\": []}")));

        assertThat(client.lookup(CONTEXT, LOOK)).isEmpty();
    }

    // "Cannot tell" must never read as "it did not go out": the message would be offered to be sent again.
    @Test
    void notKnowingIsAFailureNotAnEmptyList() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).willReturn(error(409, "CANNOT_TELL")));

        assertFails(() -> client.lookup(CONTEXT, LOOK), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void anAnswerWithoutIdsIsNotAnEmptyList() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).willReturn(okJson("{\"found\": true}")));

        assertFails(() -> client.lookup(CONTEXT, LOOK), ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @Test
    void aLookupWithoutTheSessionHandsItOverAndLooksAgain() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).inScenario("lookup").whenScenarioStateIs(STARTED)
                .willReturn(error(404, "UNKNOWN_ACCOUNT")).willSetStateTo("again"));
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).inScenario("lookup").whenScenarioStateIs("again")
                .willReturn(okJson("{\"msgIds\": [\"8372265733140\"]}")));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(aResponse().withStatus(204)));

        assertThat(client.lookup(CONTEXT, LOOK)).containsExactly("8372265733140");
    }

    // The emergency switch (D-286): not a single request leaves for sino-zalo.
    @Test
    void zaloTurnedOffCallsNothing() {
        ZaloClient off = clientOf(URI.create(sinoZalo.baseUrl()), false);

        assertFails(() -> off.messages(CONTEXT, null, 100), ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertFails(() -> off.send(CONTEXT, SEND), ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertFails(() -> off.lookup(CONTEXT, LOOK), ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertFails(() -> off.putSession(CONTEXT), ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(sinoZalo.getAllServeEvents()).isEmpty();
    }

    private void answerReadsWith(ResponseDefinitionBuilder first, ResponseDefinitionBuilder then) {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).inScenario("read").whenScenarioStateIs(STARTED)
                .willReturn(first).willSetStateTo("again"));
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES)).inScenario("read").whenScenarioStateIs("again")
                .willReturn(then));
    }

    private static ResponseDefinitionBuilder error(int status, String code) {
        return aResponse().withStatus(status).withHeader("Content-Type", "application/json")
                .withBody("{\"code\": \"" + code + "\", \"message\": \"sino-zalo test answer\"}");
    }

    // Every failure is checked the same way: the right code, and neither the secret nor the session in its message.
    private static void assertFails(ThrowingCallable call, ProviderErrorCode code) {
        assertThatExceptionOfType(ProviderException.class).isThrownBy(call).satisfies(failure -> {
            assertThat(failure.errorCode()).isEqualTo(code);
            assertThat(failure.getMessage()).doesNotContain(SECRET).doesNotContain(COOKIE);
        });
    }

    private static ZaloClient clientOf(URI url, boolean enabled) {
        return new ZaloClient(url, SECRET, enabled, Duration.ofSeconds(1), READ_TIMEOUT, SEND_TIMEOUT);
    }

    private static int closedPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

}
