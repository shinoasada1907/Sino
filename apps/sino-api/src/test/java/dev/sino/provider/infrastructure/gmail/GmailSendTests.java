package dev.sino.provider.infrastructure.gmail;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.havingExactly;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.ConnectException;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.client.ResourceAccessException;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.http.Fault;
import com.github.tomakehurst.wiremock.verification.LoggedRequest;
import com.jayway.jsonpath.JsonPath;

import dev.sino.provider.ProviderCapability;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SendMessageResult;

/** Sending a reply through Gmail (F10, BE-59) and finding one whose outcome was unknown, against WireMock. */
class GmailSendTests {

    private static final String API = "/gmail/v1/users/me";
    private static final String ACCESS_TOKEN = "ya29.gmail-send-access-token";
    private static final UUID CLIENT_MESSAGE_ID = UUID.fromString("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b");
    private static final String SINO_MESSAGE_ID = "<sino.6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b@gmail.test>";
    private static final SendMessageCommand REPLY = new SendMessageCommand("thread-42", "Em nhận được rồi.",
            "msg-41", List.of(new Address("An", "an@example.test")), CLIENT_MESSAGE_ID);

    private static WireMockServer gmail;

    @BeforeAll
    static void startGmail() {
        gmail = new WireMockServer(options().dynamicPort());
        gmail.start();
    }

    @AfterAll
    static void stopGmail() {
        gmail.stop();
    }

    @BeforeEach
    void aMailboxWithAMessageToAnswer() {
        gmail.resetAll();
        gmail.stubFor(get(urlPathEqualTo(API + "/profile"))
                .willReturn(okJson("{\"emailAddress\": \"me@gmail.test\", \"historyId\": \"1000\"}")));
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/msg-41")).withQueryParam("format", equalTo("metadata"))
                .willReturn(okJson("""
                        {"id": "msg-41", "threadId": "thread-42", "payload": {"headers": [
                          {"name": "Subject", "value": "=?UTF-8?B?QsOhbyBjw6FvIHRow6FuZyA5?="},
                          {"name": "Message-ID", "value": "<orig@mail.example.test>"},
                          {"name": "References", "value": "<first@mail.example.test>"}]}}
                        """)));
    }

    @Test
    void gmailSendsAndSaysSo() {
        assertThat(gmail().capabilities().supports(ProviderCapability.SEND_MESSAGES)).isTrue();
    }

    @Test
    void aReplyGoesInTheThreadOfTheMessageItAnswers() {
        answerTheSendWith(okJson("{\"id\": \"msg-43\", \"threadId\": \"thread-42\", \"labelIds\": [\"SENT\"]}"));

        SendMessageResult result = gmail().sendMessage(context(), REPLY);

        assertThat(result.externalMessageId()).isEqualTo("msg-43");
        assertThat(result.status()).isEqualTo(MessageStatus.SENT);
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/messages/msg-41"))
                .withQueryParam("format", equalTo("metadata"))
                .withQueryParam("metadataHeaders", havingExactly("Subject", "Message-ID", "References")));
        LoggedRequest send = onlySend();
        assertThat(send.getHeader("Authorization")).isEqualTo("Bearer " + ACCESS_TOKEN);
        assertThat(JsonPath.<String>read(send.getBodyAsString(), "$.threadId")).isEqualTo("thread-42");
        String mime = rawOf(send);
        assertThat(mime).contains("From: me@gmail.test\r\n", "To: An <an@example.test>\r\n",
                "Message-ID: " + SINO_MESSAGE_ID + "\r\n", "In-Reply-To: <orig@mail.example.test>\r\n");
        assertThat(headerOf(mime, "References")).isEqualTo("<first@mail.example.test> <orig@mail.example.test>");
        assertThat(MailHeaders.decode(headerOf(mime, "Subject"))).isEqualTo("Re: Báo cáo tháng 9");
    }

    @Test
    void aReplyToAMessageGmailNoLongerHasStillCarriesTheThreadId() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/msg-41")).willReturn(aResponse().withStatus(404)));
        answerTheSendWith(okJson("{\"id\": \"msg-43\", \"threadId\": \"thread-42\"}"));

        gmail().sendMessage(context(), REPLY);

        assertThat(JsonPath.<String>read(onlySend().getBodyAsString(), "$.threadId")).isEqualTo("thread-42");
        assertThat(rawOf(onlySend())).doesNotContain("In-Reply-To:", "References:");
    }

    // Gmail refused, so the message did not go: Sino may offer to send it again.
    @ParameterizedTest
    @CsvSource({ "400, REQUEST_REJECTED", "403, REQUEST_REJECTED", "401, AUTH_EXPIRED", "429, RATE_LIMITED" })
    void aRefusalLeavesTheMessageUnsent(int status, ProviderErrorCode code) {
        answerTheSendWith(aResponse().withStatus(status));

        assertThatSendFails(code);
    }

    // Gmail may have sent it: Sino must ask later rather than send it twice (D-132, D-135).
    @ParameterizedTest
    @CsvSource({ "500", "502", "503" })
    void aServerErrorLeavesTheOutcomeUnknown(int status) {
        answerTheSendWith(aResponse().withStatus(status));

        assertThatSendFails(ProviderErrorCode.OUTCOME_UNKNOWN);
    }

    @Test
    void noAnswerInTimeLeavesTheOutcomeUnknown() {
        answerTheSendWith(okJson("{\"id\": \"msg-43\"}").withFixedDelay(2_500));

        assertThatSendFails(ProviderErrorCode.OUTCOME_UNKNOWN);
    }

    @Test
    void aConnectionThatBreaksOffLeavesTheOutcomeUnknown() {
        answerTheSendWith(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER));

        assertThatSendFails(ProviderErrorCode.OUTCOME_UNKNOWN);
    }

    // The request itself never left: nothing was sent.
    @Test
    void aSendThatCouldNotReachGmailLeftNothing() {
        assertThat(GmailApi.sendFailure(new ResourceAccessException("x", new ConnectException("refused"))))
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(GmailApi.sendFailure(new ResourceAccessException("x", new HttpConnectTimeoutException("slow"))))
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(GmailApi.sendFailure(new ResourceAccessException("x", new UnknownHostException("gmail"))))
                .isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(GmailApi.sendFailure(new ResourceAccessException("x", new HttpTimeoutException("no answer"))))
                .isEqualTo(ProviderErrorCode.OUTCOME_UNKNOWN);
    }

    // Reading what to answer fails before anything is sent.
    @Test
    void aFailureBeforeSendingLeavesTheMessageUnsent() {
        gmail.stubFor(get(urlPathEqualTo(API + "/profile")).willReturn(aResponse().withStatus(503)));

        assertThatSendFails(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        gmail.verify(exactly(0), postRequestedFor(urlPathEqualTo(API + "/messages/send")));
    }

    @Test
    void aMessageSinoSentIsFoundByTheMessageIdItGaveIt() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages"))
                .withQueryParam("q", equalTo("rfc822msgid:" + SINO_MESSAGE_ID))
                .willReturn(okJson("{\"messages\": [{\"id\": \"msg-43\", \"threadId\": \"thread-42\"}]}")));

        assertThat(gmail().findSentMessage(context(), CLIENT_MESSAGE_ID)).contains("msg-43");
    }

    @Test
    void aMessageGmailNeverGotIsNotFound() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages")).willReturn(okJson("{\"resultSizeEstimate\": 0}")));

        assertThat(gmail().findSentMessage(context(), CLIENT_MESSAGE_ID)).isEmpty();
    }

    private static void answerTheSendWith(ResponseDefinitionBuilder response) {
        gmail.stubFor(post(urlPathEqualTo(API + "/messages/send"))
                .withRequestBody(matchingJsonPath("$.raw")).willReturn(response));
    }

    private static void assertThatSendFails(ProviderErrorCode code) {
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmail().sendMessage(context(), REPLY))
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(code))
                .withMessageNotContaining(ACCESS_TOKEN);
    }

    private static LoggedRequest onlySend() {
        List<LoggedRequest> sends = gmail.findAll(postRequestedFor(urlPathEqualTo(API + "/messages/send")));
        assertThat(sends).hasSize(1);
        return sends.getFirst();
    }

    private static String rawOf(LoggedRequest send) {
        String raw = JsonPath.read(send.getBodyAsString(), "$.raw");
        return new String(Base64.getUrlDecoder().decode(raw), StandardCharsets.UTF_8);
    }

    // Unfolded, so an encoded subject split over lines reads as one value.
    private static String headerOf(String mime, String name) {
        String head = mime.substring(0, mime.indexOf("\r\n\r\n")).replaceAll("\r\n[ \t]", " ");
        return head.lines().filter(line -> line.startsWith(name + ":")).findFirst().orElseThrow()
                .substring(name.length() + 1).strip();
    }

    // A send gets 1 s here, the other calls 5 s: a send that used their client would wait out a slow answer.
    private static GmailProvider gmail() {
        return new GmailProvider(URI.create(gmail.baseUrl() + "/v1/userinfo"), URI.create(gmail.baseUrl()),
                URI.create(gmail.baseUrl() + "/revoke"), Duration.ofSeconds(1), Duration.ofSeconds(5), null,
                Duration.ofSeconds(1));
    }

    private static ProviderContext context() {
        return new ProviderContext(UUID.randomUUID(), "110248495921238986420", new OAuth2Credentials(ACCESS_TOKEN,
                null, Set.of("openid", GmailProvider.GMAIL_READONLY, GmailProvider.GMAIL_SEND)));
    }

}
