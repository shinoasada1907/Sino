package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
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

import java.net.URI;
import java.time.Instant;
import java.util.List;
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
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.OutgoingImage;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SendMessageResult;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Sending a reply through personal Zalo and reconciling an unknown send via {@code sino-zalo} (F09, ZL-09, D-280,
 * D-281, D-289), against WireMock.
 */
class ZaloSendTests {

    private static final UUID ACCOUNT_ID = UUID.fromString("3e7f8a10-2b4c-4d5e-9f60-1a2b3c4d5e6f");
    private static final UUID CLIENT_MESSAGE_ID = UUID.fromString("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b");
    private static final String OWN_ID = "100000000000000001";
    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String MESSAGES = "/accounts/" + ACCOUNT_ID + "/messages";
    private static final String LOOKUP = "/accounts/" + ACCOUNT_ID + "/sent/lookup";
    private static final String SESSION = "/accounts/" + ACCOUNT_ID + "/session";
    private static final Instant STARTED_AT = Instant.parse("2026-10-17T08:00:00Z");
    private static final ProviderContext CONTEXT = new ProviderContext(ACCOUNT_ID, OWN_ID,
            new TokenCredentials("{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"zpw-send-cookie\"}], "
                    + "\"imei\": \"imei-send\", \"userAgent\": \"Mozilla/5.0 (Sino send)\"}"));
    private static final SendMessageCommand DIRECT_REPLY = new SendMessageCommand("200000000000000002",
            ConversationType.DIRECT, "Em nhận được rồi ạ.", "1001", List.of(), CLIENT_MESSAGE_ID, null);
    private static final SendMessageCommand GROUP_REPLY = new SendMessageCommand("g-900000000000000001",
            ConversationType.GROUP, "Ok mình tới ngay", "1002", List.of(), CLIENT_MESSAGE_ID, null);

    // In base64 these are AQIDBPv//g==: with a plus-or-slash-making byte in it, base64url would not pass for base64.
    private static final byte[] PICTURE_BYTES = {1, 2, 3, 4, (byte) 0xfb, (byte) 0xff, (byte) 0xfe};
    private static final OutgoingImage PICTURE = new OutgoingImage(PICTURE_BYTES, "image/png", "sticker.png", 128, 96);
    private static final SendMessageCommand DIRECT_PICTURE = new SendMessageCommand("200000000000000002",
            ConversationType.DIRECT, null, null, List.of(), CLIENT_MESSAGE_ID, null, PICTURE);
    private static final SendMessageCommand GROUP_PICTURE = new SendMessageCommand("g-900000000000000001",
            ConversationType.GROUP, null, null, List.of(), CLIENT_MESSAGE_ID, null, PICTURE);

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
    void zaloSendsAndSaysSo() {
        assertThat(zalo.capabilities().supports(ProviderCapability.SEND_MESSAGES)).isTrue();
    }

    @Test
    void aReplyInADirectConversationGoesToZaloUserThread() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(created("8372265733140")));

        SendMessageResult result = zalo.sendMessage(CONTEXT, DIRECT_REPLY);

        assertThat(result.externalMessageId()).isEqualTo("8372265733140");
        assertThat(result.status()).isEqualTo(MessageStatus.SENT);
        assertThat(result.sentAt()).isEqualTo(Instant.parse("2026-10-17T08:01:00Z"));
        sinoZalo.verify(postRequestedFor(urlPathEqualTo(MESSAGES))
                .withHeader("Authorization", equalTo("Bearer " + SECRET))
                .withRequestBody(equalToJson("""
                        {
                          "threadId": "200000000000000002",
                          "threadType": "USER",
                          "text": "Em nhận được rồi ạ.",
                          "clientMessageId": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"
                        }
                        """)));
    }

    @Test
    void aReplyInAGroupConversationGoesToZaloGroupThread() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(created("8372265733141")));

        SendMessageResult result = zalo.sendMessage(CONTEXT, GROUP_REPLY);

        assertThat(result.externalMessageId()).isEqualTo("8372265733141");
        assertThat(result.status()).isEqualTo(MessageStatus.SENT);
        sinoZalo.verify(postRequestedFor(urlPathEqualTo(MESSAGES))
                .withRequestBody(equalToJson("""
                        {
                          "threadId": "g-900000000000000001",
                          "threadType": "GROUP",
                          "text": "Ok mình tới ngay",
                          "clientMessageId": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"
                        }
                        """)));
    }

    @Test
    void zaloSendsPicturesAndSaysSo() {
        assertThat(zalo.capabilities().supports(ProviderCapability.SEND_IMAGES)).isTrue();
    }

    // D-353: the bytes go in base64 under image, and the message has no text at all.
    @Test
    void aPictureInADirectConversationGoesToZaloUserThreadWithoutText() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(created("8372265733150")));

        SendMessageResult result = zalo.sendMessage(CONTEXT, DIRECT_PICTURE);

        assertThat(result.externalMessageId()).isEqualTo("8372265733150");
        assertThat(result.status()).isEqualTo(MessageStatus.SENT);
        sinoZalo.verify(postRequestedFor(urlPathEqualTo(MESSAGES))
                .withHeader("Authorization", equalTo("Bearer " + SECRET))
                .withRequestBody(equalToJson("""
                        {
                          "threadId": "200000000000000002",
                          "threadType": "USER",
                          "image": {"data": "AQIDBPv//g==", "fileName": "sticker.png", "width": 128, "height": 96},
                          "clientMessageId": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"
                        }
                        """)));
    }

    @Test
    void aPictureInAGroupConversationGoesToZaloGroupThread() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(created("8372265733151")));

        SendMessageResult result = zalo.sendMessage(CONTEXT, GROUP_PICTURE);

        assertThat(result.externalMessageId()).isEqualTo("8372265733151");
        sinoZalo.verify(postRequestedFor(urlPathEqualTo(MESSAGES))
                .withRequestBody(equalToJson("""
                        {
                          "threadId": "g-900000000000000001",
                          "threadType": "GROUP",
                          "image": {"data": "AQIDBPv//g==", "fileName": "sticker.png", "width": 128, "height": 96},
                          "clientMessageId": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"
                        }
                        """)));
    }

    // sino-zalo takes a text or a picture, not both (ZS-02): Sino says so before asking.
    @Test
    void aTextBesideAPictureIsRefusedWithoutCallingSinoZalo() {
        SendMessageCommand both = new SendMessageCommand("200000000000000002", ConversationType.DIRECT, "xem này", null,
                List.of(), CLIENT_MESSAGE_ID, null, PICTURE);

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> zalo.sendMessage(CONTEXT, both))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
        assertThat(sinoZalo.getAllServeEvents()).isEmpty();
    }

    // D-281 holds for a picture too, and a 400 of sino-zalo (a picture it cannot take) is a refusal: nothing was sent.
    @ParameterizedTest
    @CsvSource({
        "400, INVALID_IMAGE, REQUEST_REJECTED",
        "429, RATE_LIMITED, RATE_LIMITED",
        "422, REJECTED, REQUEST_REJECTED",
        "504, OUTCOME_UNKNOWN, OUTCOME_UNKNOWN"
    })
    void aPictureSendFailsAsATextSendDoes(int status, String zaloCode, ProviderErrorCode expected) {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(error(status, zaloCode)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.sendMessage(CONTEXT, DIRECT_PICTURE))
                .extracting(ProviderException::errorCode)
                .isEqualTo(expected);
    }

    // The bytes are the user's picture: a failure, a request's text, a log line never carry them.
    @Test
    void theBytesOfAPictureNeverShowInAFailureOrInTheTextOfTheRequest() {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(error(500, "BOOM")));

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> zalo.sendMessage(CONTEXT, DIRECT_PICTURE))
                .withMessageNotContaining("AQIDBPv//g==");
        String request = new ZaloClient.SendRequest("200000000000000002", ZaloClient.ThreadType.USER, null,
                ZaloClient.ImageRequest.of(PICTURE), CLIENT_MESSAGE_ID.toString()).toString();
        assertThat(request).doesNotContain("AQIDBPv//g==").contains("sticker.png");
    }

    // A picture has no text to find it by: sino-zalo finds it from what it sent under this clientMessageId.
    @Test
    void findSentMessagesForAPictureAsksWithoutAText() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).willReturn(okJson("{\"msgIds\": [\"8372265733150\"]}")));

        List<String> found = zalo.findSentMessages(CONTEXT, DIRECT_PICTURE, STARTED_AT);

        assertThat(found).containsExactly("8372265733150");
        sinoZalo.verify(postRequestedFor(urlPathEqualTo(LOOKUP))
                .withRequestBody(equalToJson("""
                        {
                          "threadId": "200000000000000002",
                          "clientMessageId": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
                          "after": "2026-10-17T08:00:00Z"
                        }
                        """)));
    }

    // D-281: 429 is RATE_LIMITED, 422 is REQUEST_REJECTED, 504 is OUTCOME_UNKNOWN.
    @ParameterizedTest
    @CsvSource({
        "429, RATE_LIMITED, RATE_LIMITED",
        "422, ZALO_SEND_REJECTED, REQUEST_REJECTED",
        "504, SEND_TIMEOUT, OUTCOME_UNKNOWN"
    })
    void sendFailuresFollowTheErrorMappingTable(int status, String zaloCode, ProviderErrorCode expected) {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(error(status, zaloCode)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.sendMessage(CONTEXT, DIRECT_REPLY))
                .extracting(ProviderException::errorCode)
                .isEqualTo(expected);
    }

    // D-289: 404 or 410 means sino-zalo has not sent anything yet; Sino hands over the stored session and sends once.
    @ParameterizedTest
    @CsvSource({
        "404, UNKNOWN_ACCOUNT",
        "410, SESSION_ENDED"
    })
    void aSendWithoutASessionHandsTheSessionOverAndSendsOnce(int status, String code) {
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).inScenario("send").whenScenarioStateIs(STARTED)
                .willReturn(error(status, code)).willSetStateTo("ready"));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION)).willReturn(aResponse().withStatus(204)));
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).inScenario("send").whenScenarioStateIs("ready")
                .willReturn(created("8372265733142")));

        SendMessageResult result = zalo.sendMessage(CONTEXT, DIRECT_REPLY);

        assertThat(result.externalMessageId()).isEqualTo("8372265733142");
        sinoZalo.verify(exactly(1), putRequestedFor(urlPathEqualTo(SESSION)));
        sinoZalo.verify(exactly(2), postRequestedFor(urlPathEqualTo(MESSAGES)));
    }

    @Test
    void findSentMessagesAsksSinoZaloForMatchingIdsSinceTheSendStarted() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).willReturn(okJson("{\"msgIds\": [\"8372265733140\"]}")));

        List<String> found = zalo.findSentMessages(CONTEXT, GROUP_REPLY, STARTED_AT);

        assertThat(found).containsExactly("8372265733140");
        sinoZalo.verify(postRequestedFor(urlPathEqualTo(LOOKUP))
                .withRequestBody(equalToJson("""
                        {
                          "threadId": "g-900000000000000001",
                          "clientMessageId": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
                          "text": "Ok mình tới ngay",
                          "after": "2026-10-17T08:00:00Z"
                        }
                        """)));
    }

    @Test
    void findSentMessagesHandsTheSessionOverWhenSinoZaloRestarted() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).inScenario("lookup").whenScenarioStateIs(STARTED)
                .willReturn(error(404, "UNKNOWN_ACCOUNT")).willSetStateTo("ready"));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION)).willReturn(aResponse().withStatus(204)));
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).inScenario("lookup").whenScenarioStateIs("ready")
                .willReturn(okJson("{\"msgIds\": [\"8372265733140\"]}")));

        assertThat(zalo.findSentMessages(CONTEXT, GROUP_REPLY, STARTED_AT)).containsExactly("8372265733140");
    }

    // D-280: 409 CANNOT_TELL means sino-zalo lost its buffer before the send settled; it must throw OUTCOME_UNKNOWN so
    // ReplyService.reconcile keeps this message UNKNOWN (never FAILED) while still checking newer messages.
    @Test
    void findSentMessagesWhenSinoZaloCannotTellThrowsOutcomeUnknownNotAnEmptyList() {
        sinoZalo.stubFor(post(urlPathEqualTo(LOOKUP)).willReturn(error(409, "CANNOT_TELL")));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> zalo.findSentMessages(CONTEXT, GROUP_REPLY, STARTED_AT))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.OUTCOME_UNKNOWN);
    }

    private static ResponseDefinitionBuilder created(String msgId) {
        return aResponse().withStatus(201).withHeader("Content-Type", "application/json")
                .withBody("{\"msgId\": \"" + msgId + "\", \"sentAt\": \"2026-10-17T08:01:00.000Z\"}");
    }

    private static ResponseDefinitionBuilder error(int status, String code) {
        return aResponse().withStatus(status).withHeader("Content-Type", "application/json")
                .withBody("{\"code\": \"" + code + "\", \"message\": \"failure\"}");
    }

}
