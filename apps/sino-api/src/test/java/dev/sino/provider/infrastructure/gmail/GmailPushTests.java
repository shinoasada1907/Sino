package dev.sino.provider.infrastructure.gmail;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static dev.sino.provider.ProviderCapability.ATTACHMENTS;
import static dev.sino.provider.ProviderCapability.PUSH_WEBHOOK;
import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static dev.sino.provider.ProviderCapability.THREADS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.assertj.core.api.ThrowableAssertAlternative;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;

import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.PushRegistration;

/** Gmail tells Sino of changes through Cloud Pub/Sub (D-76, BE-51), against a fake Gmail API (WireMock). */
class GmailPushTests {

    private static final String API = "/gmail/v1/users/me";
    private static final String ACCESS_TOKEN = "ya29.gmail-push-access-token";
    private static final String TOPIC = "projects/sino-test/topics/gmail";
    // As the profile writes it, which is what the notices carry.
    private static final String MAILBOX = "Owner.Name@gmail.test";
    private static final Instant EXPIRES = Instant.parse("2026-10-17T08:00:00.123Z");

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
    void forgetEverything() {
        gmail.resetAll();
    }

    @Test
    void withATopicGmailDeclaresPush() {
        assertThat(gmailWith(TOPIC).capabilities().values())
                .containsExactly(READ_MESSAGES, SEND_MESSAGES, ATTACHMENTS, PUSH_WEBHOOK, THREADS);
    }

    @Test
    void withoutATopicGmailIsOnlyPolledAndGoogleNeverHearsOfAWatch() {
        GmailProvider polled = gmailWith(null);

        assertThat(polled.capabilities().supports(PUSH_WEBHOOK)).isFalse();
        assertThat(polled.registerPush(context())).isEmpty();
        gmail.verify(0, anyRequestedFor(anyUrl()));
    }

    @Test
    void watchesTheWholeMailboxWithTheTopic() {
        profile(MAILBOX);
        answerTheWatchWith(okJson("""
                {"historyId": "1000", "expiration": "%d"}
                """.formatted(EXPIRES.toEpochMilli())));

        PushRegistration registration = gmailWith(TOPIC).registerPush(context()).orElseThrow();

        assertThat(registration.address()).isEqualTo(MAILBOX);
        assertThat(registration.expiresAt()).isEqualTo(EXPIRES);
        gmail.verify(postRequestedFor(urlPathEqualTo(API + "/watch"))
                .withHeader("Authorization", equalTo("Bearer " + ACCESS_TOKEN))
                .withRequestBody(equalToJson("""
                        {"topicName": "%s"}
                        """.formatted(TOPIC))));
    }

    @Test
    void anExpirationWrittenAsANumberIsReadToo() {
        profile(MAILBOX);
        answerTheWatchWith(okJson("""
                {"historyId": "1000", "expiration": %d}
                """.formatted(EXPIRES.toEpochMilli())));

        assertThat(gmailWith(TOPIC).registerPush(context()).orElseThrow().expiresAt()).isEqualTo(EXPIRES);
    }

    @ParameterizedTest
    @ValueSource(strings = { "{\"historyId\": \"1000\"}", "{\"expiration\": \"soon\"}", "{\"expiration\": \"-5\"}",
        "{\"expiration\": \"\"}" })
    void aWatchWithoutAUsableExpirationFails(String body) {
        profile(MAILBOX);
        answerTheWatchWith(okJson(body));

        assertThatRegistrationFails(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @Test
    void aProfileWithoutAnAddressFailsBeforeAnyWatch() {
        gmail.stubFor(get(urlPathEqualTo(API + "/profile")).willReturn(okJson("{\"historyId\": \"1000\"}")));
        answerTheWatchWith(okJson("{\"expiration\": \"%d\"}".formatted(EXPIRES.toEpochMilli())));

        assertThatRegistrationFails(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        gmail.verify(0, postRequestedFor(urlPathEqualTo(API + "/watch")));
    }

    // Gmail refuses a topic it cannot publish to: wrong name, other project, no publisher grant.
    @ParameterizedTest
    @ValueSource(ints = { 400, 403, 404 })
    void aTopicGmailCannotPublishToIsARefusal(int status) {
        profile(MAILBOX);
        answerTheWatchWith(aResponse().withStatus(status).withHeader("Content-Type", "application/json")
                .withBody("{\"error\": {\"code\": %d, \"message\": \"Error sending test message to Cloud PubSub %s\"}}"
                        .formatted(status, TOPIC)));

        assertThatRegistrationFails(ProviderErrorCode.REQUEST_REJECTED).withMessageNotContaining(TOPIC);
    }

    @Test
    void aRefusedTokenIsAnExpiredAuthorization() {
        profile(MAILBOX);
        answerTheWatchWith(aResponse().withStatus(401));

        assertThatRegistrationFails(ProviderErrorCode.AUTH_EXPIRED);
    }

    @Test
    void aGmailThatIsDownIsUnavailable() {
        profile(MAILBOX);
        answerTheWatchWith(aResponse().withStatus(503));

        assertThatRegistrationFails(ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    private static ThrowableAssertAlternative<ProviderException> assertThatRegistrationFails(ProviderErrorCode code) {
        return assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmailWith(TOPIC).registerPush(context()))
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(code))
                .withMessageNotContaining(ACCESS_TOKEN)
                .withMessageNotContaining(MAILBOX);
    }

    private static void profile(String emailAddress) {
        gmail.stubFor(get(urlPathEqualTo(API + "/profile")).willReturn(okJson("""
                {"emailAddress": "%s", "messagesTotal": 3, "threadsTotal": 2, "historyId": "1000"}
                """.formatted(emailAddress))));
    }

    private static void answerTheWatchWith(ResponseDefinitionBuilder response) {
        gmail.stubFor(post(urlPathEqualTo(API + "/watch")).willReturn(response));
    }

    private static GmailProvider gmailWith(String topic) {
        return new GmailProvider(URI.create(gmail.baseUrl() + "/v1/userinfo"), URI.create(gmail.baseUrl()),
                URI.create(gmail.baseUrl() + "/revoke"), Duration.ofSeconds(1), Duration.ofSeconds(2), topic);
    }

    private static ProviderContext context() {
        return new ProviderContext(UUID.randomUUID(), "110248495921238986420", new OAuth2Credentials(ACCESS_TOKEN,
                null, Set.of("openid", "https://www.googleapis.com/auth/gmail.readonly")));
    }

}
