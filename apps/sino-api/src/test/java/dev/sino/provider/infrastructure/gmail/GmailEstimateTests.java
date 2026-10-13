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
import java.util.stream.Collectors;
import java.util.stream.IntStream;

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

/**
 * How many messages Gmail has for the "Đồng bộ" step (D-65): counted from the listed IDs for a range of days (BE-61),
 * the profile's total for the whole mailbox; against a fake Gmail API (WireMock).
 */
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
    void fromAMomentGmailCountsTheMessagesItLists() {
        answerTheListWith(okJson(page(3, null)));

        assertThat(gmailProvider().estimateMessages(context(), SINCE)).hasValue(3);
        gmail.verify(exactly(1), anyRequestedFor(anyUrl()));
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/messages")).withQueryParam("q", equalTo(AFTER_SINCE))
                .withQueryParam("maxResults", equalTo("500"))
                .withQueryParam("fields", equalTo("messages/id,nextPageToken"))
                .withQueryParam("pageToken", absent())
                .withHeader("Authorization", equalTo("Bearer " + ACCESS_TOKEN)));
    }

    @Test
    void theCountGoesOnPageAfterPage() {
        answerPage(null, okJson(page(500, "page-2")));
        answerPage("page-2", okJson(page(120, null)));

        assertThat(gmailProvider().estimateMessages(context(), SINCE)).hasValue(620);
        gmail.verify(exactly(2), getRequestedFor(urlPathEqualTo(API + "/messages")));
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/messages")).withQueryParam("q", equalTo(AFTER_SINCE))
                .withQueryParam("pageToken", equalTo("page-2")));
    }

    // Gmail may give fewer than 500 a page; the count still never says more than 5 000.
    @ParameterizedTest
    @CsvSource({ "500, 10", "400, 13" })
    void theCountStopsAtFiveThousand(int onEachPage, int pagesRead) {
        answerTheListWith(okJson(page(onEachPage, "one-more")));

        assertThat(gmailProvider().estimateMessages(context(), SINCE)).hasValue(5_000);
        gmail.verify(exactly(pagesRead), getRequestedFor(urlPathEqualTo(API + "/messages")));
    }

    @Test
    void aFailureMidwayGivesNoCount() {
        answerPage(null, okJson(page(500, "page-2")));
        answerPage("page-2", aResponse().withStatus(503));

        assertThatEstimateFails(SINCE, ProviderErrorCode.PROVIDER_UNAVAILABLE);
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
    @ValueSource(strings = { "", ", \"messagesTotal\": -1" })
    void withoutAUsableTotalTheWholeMailboxHasNoEstimate(String total) {
        answerTheProfileWith(okJson("{\"emailAddress\": \"owner@gmail.test\"" + total + "}"));

        assertThat(gmailProvider().estimateMessages(context(), null)).isEmpty();
    }

    // Counting needs no number from Gmail: a list without messages is none, whatever Gmail estimates.
    @Test
    void aRangeWithoutMessagesCountsNone() {
        answerTheListWith(okJson("{\"messages\": [], \"resultSizeEstimate\": 201}"));

        assertThat(gmailProvider().estimateMessages(context(), SINCE)).hasValue(0);
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

    private static void answerPage(String pageToken, ResponseDefinitionBuilder response) {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages"))
                .withQueryParam("pageToken", pageToken == null ? absent() : equalTo(pageToken)).willReturn(response));
    }

    // A page of IDs; Gmail's own estimate is there to show it is not what is counted.
    private static String page(int messages, String nextPageToken) {
        String ids = IntStream.range(0, messages).mapToObj(n -> "{\"id\": \"id-" + n + "\"}")
                .collect(Collectors.joining(", "));
        return "{\"messages\": [" + ids + "], \"resultSizeEstimate\": 201"
                + (nextPageToken == null ? "" : ", \"nextPageToken\": \"" + nextPageToken + "\"") + "}";
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
