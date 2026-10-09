package dev.sino.provider.infrastructure.gmail;

import static com.github.tomakehurst.wiremock.client.WireMock.absent;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.any;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;

import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

/** How many messages Gmail estimates (D-65), against a fake Gmail API (WireMock). */
class GmailEstimateTests {

    private static final String API = "/gmail/v1/users/me";
    private static final String ACCESS_TOKEN = "ya29.gmail-estimate-access-token";
    private static final Instant SINCE = Instant.parse("2026-07-11T08:30:00.750Z");
    private static final String AFTER_SINCE = "after:" + SINCE.getEpochSecond();

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
    void forgetEarlierCalls() {
        gmail.resetAll();
    }

    @Test
    void fromAMomentGmailEstimatesWithAListOfOneMessage() {
        answerTheListWith(okJson("""
                {"messages": [{"id": "18f0a1b2c3d4e5f6", "threadId": "thread-report"}],
                 "nextPageToken": "page-2", "resultSizeEstimate": 1180}
                """));

        assertThat(gmailProvider().estimateMessages(context(), SINCE)).hasValue(1180);
        gmail.verify(exactly(1), anyRequestedFor(anyUrl()));
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/messages")).withQueryParam("q", equalTo(AFTER_SINCE))
                .withQueryParam("maxResults", equalTo("1")).withQueryParam("pageToken", absent())
                .withHeader("Authorization", equalTo("Bearer " + ACCESS_TOKEN)));
    }

    @Test
    void theWholeMailboxIsTheTotalOfItsProfile() {
        answerTheProfileWith(okJson("""
                {"emailAddress": "owner@gmail.test", "messagesTotal": 4321, "threadsTotal": 1500, "historyId": "1000"}
                """));

        assertThat(gmailProvider().estimateMessages(context(), null)).hasValue(4321);
        gmail.verify(exactly(1), anyRequestedFor(anyUrl()));
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/profile"))
                .withHeader("Authorization", equalTo("Bearer " + ACCESS_TOKEN)));
    }

    @Test
    void anEmptyMailboxEstimatesNone() {
        answerTheListWith(okJson("{\"resultSizeEstimate\": 0}"));
        answerTheProfileWith(okJson("{\"emailAddress\": \"owner@gmail.test\", \"messagesTotal\": 0}"));

        assertThat(gmailProvider().estimateMessages(context(), SINCE)).hasValue(0);
        assertThat(gmailProvider().estimateMessages(context(), null)).hasValue(0);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", ", \"resultSizeEstimate\": -1, \"messagesTotal\": -1" })
    void withoutAUsableNumberThereIsNoEstimate(String numbers) {
        answerTheListWith(okJson("{\"messages\": []" + numbers + "}"));
        answerTheProfileWith(okJson("{\"emailAddress\": \"owner@gmail.test\"" + numbers + "}"));

        assertThat(gmailProvider().estimateMessages(context(), SINCE)).isEmpty();
        assertThat(gmailProvider().estimateMessages(context(), null)).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({ "401, AUTH_EXPIRED", "503, PROVIDER_UNAVAILABLE", "429, RATE_LIMITED", "400, REQUEST_REJECTED" })
    void gmailFailuresAreProviderFailures(int status, ProviderErrorCode code) {
        gmail.stubFor(any(anyUrl()).willReturn(aResponse().withStatus(status)));

        assertThatEstimateFails(SINCE, code);
        assertThatEstimateFails(null, code);
    }

    @Test
    void anAnswerSinoCannotReadIsAProviderFailure() {
        gmail.stubFor(any(anyUrl()).willReturn(aResponse().withStatus(200)
                .withHeader("Content-Type", "application/json").withBody("not json")));

        assertThatEstimateFails(SINCE, ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        assertThatEstimateFails(null, ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    private static void answerTheListWith(ResponseDefinitionBuilder response) {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages")).willReturn(response));
    }

    private static void answerTheProfileWith(ResponseDefinitionBuilder response) {
        gmail.stubFor(get(urlPathEqualTo(API + "/profile")).willReturn(response));
    }

    private static void assertThatEstimateFails(Instant since, ProviderErrorCode code) {
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmailProvider().estimateMessages(context(), since))
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(code))
                .withMessageNotContaining(ACCESS_TOKEN);
    }

    private static GmailProvider gmailProvider() {
        return new GmailProvider(URI.create(gmail.baseUrl() + "/v1/userinfo"), URI.create(gmail.baseUrl()),
                URI.create(gmail.baseUrl() + "/revoke"), Duration.ofSeconds(1), Duration.ofSeconds(2));
    }

    private static ProviderContext context() {
        return new ProviderContext(UUID.randomUUID(), "110248495921238986420", new OAuth2Credentials(ACCESS_TOKEN,
                null, Set.of("openid", "https://www.googleapis.com/auth/gmail.readonly")));
    }

}
