package dev.sino.account.infrastructure.oauth;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.ok;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Duration;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.provider.ProviderType;

/**
 * Revoking is best effort: Sino tells the provider to drop a grant it will not use, and a failure only leaves a
 * warning, never the token.
 */
@ExtendWith(OutputCaptureExtension.class)
class OAuth2TokenRevokerTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final String TOKEN = "1//token-to-revoke";

    private static WireMockServer google;

    private final OAuth2TokenRevoker revoker = new OAuth2TokenRevoker(Duration.ofSeconds(2), Duration.ofMillis(500));

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
    void postsTheTokenAsAForm() {
        google.stubFor(post(urlPathEqualTo("/revoke")).willReturn(ok()));

        revoker.revoke(GMAIL, revocationUri(), TOKEN);

        google.verify(postRequestedFor(urlPathEqualTo("/revoke"))
                .withHeader("Content-Type", containing("application/x-www-form-urlencoded"))
                .withFormParam("token", equalTo(TOKEN)));
    }

    @Test
    void aRefusalIsOnlyAWarningWithoutTheToken(CapturedOutput output) {
        google.stubFor(post(urlPathEqualTo("/revoke")).willReturn(aResponse().withStatus(503)
                .withBody("down " + TOKEN)));

        revoker.revoke(GMAIL, revocationUri(), TOKEN);

        assertThat(output).contains("WARN").contains("gmail").contains("503").doesNotContain(TOKEN);
    }

    @Test
    void aSlowProviderIsOnlyAWarning(CapturedOutput output) {
        google.stubFor(post(urlPathEqualTo("/revoke")).willReturn(ok().withFixedDelay(3000)));
        long start = System.nanoTime();

        revoker.revoke(GMAIL, revocationUri(), TOKEN);

        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
        assertThat(output).contains("WARN").contains("gmail").doesNotContain(TOKEN);
    }

    @Test
    void withoutARevocationAddressThereIsNothingToDo() {
        revoker.revoke(GMAIL, null, TOKEN);

        google.verify(0, anyRequestedFor(anyUrl()));
    }

    private static URI revocationUri() {
        return URI.create(google.baseUrl() + "/revoke");
    }

}
