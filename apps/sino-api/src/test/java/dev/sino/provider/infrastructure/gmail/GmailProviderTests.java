package dev.sino.provider.infrastructure.gmail;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageProviderContractTest;
import dev.sino.provider.spi.OAuth2Connection;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

/**
 * The Gmail connector against a fake Google (WireMock) on a real HTTP port.
 */
class GmailProviderTests {

    private static final String USERINFO = "/v1/userinfo";
    private static final String ACCESS_TOKEN = "ya29.gmail-test-access-token";
    private static final String SUB = "110248495921238986420";

    private static WireMockServer google;

    @BeforeAll
    static void startGoogle() {
        google = new WireMockServer(options().dynamicPort());
        google.start();
    }

    @AfterAll
    static void stopGoogle() {
        google.stop();
    }

    @BeforeEach
    void forgetEarlierCalls() {
        google.resetAll();
    }

    @Test
    void isGmailAndCannotDoAnythingWithMessagesYet() {
        GmailProvider gmail = gmail();

        assertThat(gmail.type()).isEqualTo(ProviderType.of("gmail"));
        assertThat(gmail.displayName()).isEqualTo("Gmail");
        for (ProviderCapability capability : ProviderCapability.values()) {
            assertThat(gmail.capabilities().supports(capability)).as(capability.name()).isFalse();
        }
    }

    @Test
    void connectsThroughGoogleOAuth2() {
        OAuth2Connection connection = gmail().oauth2().orElseThrow();

        assertThat(connection.registrationId()).isEqualTo("google");
        assertThat(connection.scopes()).containsExactlyInAnyOrder("openid", "email",
                "https://www.googleapis.com/auth/gmail.readonly");
        assertThat(connection.extraParameters())
                .containsExactlyInAnyOrderEntriesOf(Map.of("access_type", "offline", "prompt", "consent"));
        assertThat(connection.revocationUri()).isEqualTo(URI.create(google.baseUrl() + "/revoke"));
    }

    @Test
    void theProfileIsTheGoogleSubjectAndTheEmail() {
        google.stubFor(get(urlPathEqualTo(USERINFO))
                .withHeader("Authorization", equalTo("Bearer " + ACCESS_TOKEN))
                .willReturn(okJson("""
                        {"sub": "%s", "email": "owner@gmail.test", "email_verified": true}
                        """.formatted(SUB))));

        AccountProfile profile = gmail().getAccountProfile(context());

        assertThat(profile.externalAccountId()).isEqualTo(SUB);
        assertThat(profile.displayName()).isEqualTo("owner@gmail.test");
        assertThat(profile.avatarUrl()).isNull();
        google.verify(1, getRequestedFor(urlPathEqualTo(USERINFO)));
    }

    @Test
    void aProfileWithoutSubjectIsRefused() {
        google.stubFor(get(urlPathEqualTo(USERINFO)).willReturn(okJson("""
                {"email": "owner@gmail.test"}
                """)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmail().getAccountProfile(context()))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @Test
    void aRejectedTokenMeansTheAuthorizationExpired() {
        answerUserinfoWith(401);

        assertThat(failureOf(gmail()).errorCode()).isEqualTo(ProviderErrorCode.AUTH_EXPIRED);
    }

    @Test
    void throttlingIsRateLimitedWithTheWaitGoogleAskedFor() {
        google.stubFor(get(urlPathEqualTo(USERINFO))
                .willReturn(aResponse().withStatus(429).withHeader("Retry-After", "30")));

        ProviderException failure = failureOf(gmail());

        assertThat(failure.errorCode()).isEqualTo(ProviderErrorCode.RATE_LIMITED);
        assertThat(failure.retryAfter()).contains(Duration.ofSeconds(30));
    }

    @Test
    void aServerErrorMeansGoogleIsUnavailable() {
        answerUserinfoWith(503);

        assertThat(failureOf(gmail()).errorCode()).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void anotherClientErrorIsARejectedRequest() {
        answerUserinfoWith(403);

        assertThat(failureOf(gmail()).errorCode()).isEqualTo(ProviderErrorCode.REQUEST_REJECTED);
    }

    @Test
    void aSlowGoogleTimesOutInsteadOfHanging() {
        google.stubFor(get(urlPathEqualTo(USERINFO))
                .willReturn(okJson("{\"sub\": \"" + SUB + "\", \"email\": \"owner@gmail.test\"}")
                        .withFixedDelay(3_000)));
        GmailProvider impatient = new GmailProvider(uri(USERINFO), uri("/revoke"), Duration.ofSeconds(1),
                Duration.ofMillis(300));

        long started = System.nanoTime();
        ProviderException failure = failureOf(impatient);

        assertThat(failure.errorCode()).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(2));
    }

    @Test
    void errorsNeverCarryTheTokenOrWhatGoogleSent() {
        google.stubFor(get(urlPathEqualTo(USERINFO)).willReturn(aResponse().withStatus(400)
                .withBody("invalid request for " + ACCESS_TOKEN + " raw-google-body")));

        ProviderException failure = failureOf(gmail());

        assertThat(failure.getMessage()).doesNotContain(ACCESS_TOKEN).doesNotContain("raw-google-body");
    }

    @Test
    void needsAnOAuth2AccessToken() {
        ProviderContext withToken = new ProviderContext(UUID.randomUUID(), null,
                new TokenCredentials("telegram-like-token"));

        assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> gmail().getAccountProfile(withToken));
        google.verify(0, getRequestedFor(urlPathEqualTo(USERINFO)));
    }

    @Test
    void doesNotCallGoogleToSyncYet() {
        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmail().fetchUpdates(context(), SyncCursor.initial()))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED);
        assertThat(google.getAllServeEvents()).isEmpty();
    }

    @Nested
    class Contract extends MessageProviderContractTest {

        private final GmailProvider gmail = gmail();

        @Override
        protected MessageProvider provider() {
            return gmail;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return gmail;
        }

        @Override
        protected ProviderContext context() {
            return GmailProviderTests.context();
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of();
        }

    }

    private static GmailProvider gmail() {
        return new GmailProvider(uri(USERINFO), uri("/revoke"), Duration.ofSeconds(1), Duration.ofSeconds(2));
    }

    private static ProviderContext context() {
        return new ProviderContext(UUID.randomUUID(), null, new OAuth2Credentials(ACCESS_TOKEN, null,
                Set.of("openid", "email", "https://www.googleapis.com/auth/gmail.readonly")));
    }

    private static URI uri(String path) {
        return URI.create(google.baseUrl() + path);
    }

    private static void answerUserinfoWith(int status) {
        google.stubFor(get(urlPathEqualTo(USERINFO)).willReturn(aResponse().withStatus(status)));
    }

    private static ProviderException failureOf(GmailProvider gmail) {
        try {
            gmail.getAccountProfile(context());
        } catch (ProviderException failure) {
            return failure;
        }
        throw new AssertionError("expected a ProviderException");
    }

}
