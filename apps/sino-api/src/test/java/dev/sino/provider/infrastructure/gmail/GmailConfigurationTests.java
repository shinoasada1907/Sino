package dev.sino.provider.infrastructure.gmail;

import static dev.sino.provider.ProviderCapability.PUSH_WEBHOOK;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.URI;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;

import dev.sino.account.infrastructure.oauth.ConnectProperties;
import dev.sino.account.infrastructure.oauth.OAuth2Clients;
import dev.sino.provider.spi.MessageProvider;

/**
 * Gmail is on only with a Google OAuth client, so the app, the tests and CI run without a Google project.
 */
@ExtendWith(OutputCaptureExtension.class)
class GmailConfigurationTests {

    private static final String CLIENT_ID = "1234567890-test.apps.googleusercontent.test";
    private static final String CLIENT_SECRET = "GOCSPX-test-client-secret-value";
    private static final String TOPIC = "projects/sino-test/topics/gmail";

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(GmailConfiguration.class);

    @Test
    void staysOffWithoutAGoogleClientAndSaysSo(CapturedOutput output) {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(MessageProvider.class);
            assertThat(context).doesNotHaveBean(ClientRegistration.class);
        });
        assertThat(output).contains("Gmail is off").contains("SINO_GOOGLE_CLIENT_ID")
                .contains("SINO_GOOGLE_CLIENT_SECRET");
    }

    @Test
    void blankValuesCountAsMissing() {
        contextRunner.withPropertyValues("sino.google.client-id=", "sino.google.client-secret= ")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(MessageProvider.class);
                });
    }

    @Test
    void turnsOnWithAGoogleClient() {
        contextRunner.withPropertyValues("sino.google.client-id=" + CLIENT_ID,
                "sino.google.client-secret=" + CLIENT_SECRET).run(context -> {
                    assertThat(context).hasSingleBean(GmailProvider.class);
                    ClientRegistration google = context.getBean(ClientRegistration.class);
                    assertThat(google.getRegistrationId()).isEqualTo("google");
                    assertThat(google.getClientId()).isEqualTo(CLIENT_ID);
                    assertThat(google.getClientSecret()).isEqualTo(CLIENT_SECRET);
                    assertThat(google.getAuthorizationGrantType())
                            .isEqualTo(AuthorizationGrantType.AUTHORIZATION_CODE);
                    assertThat(google.getScopes())
                            .isEqualTo(context.getBean(GmailProvider.class).oauth2().orElseThrow().scopes());
                    assertThat(google.getProviderDetails().getAuthorizationUri())
                            .isEqualTo("https://accounts.google.com/o/oauth2/v2/auth");
                    assertThat(google.getProviderDetails().getTokenUri())
                            .isEqualTo("https://oauth2.googleapis.com/token");
                    assertThat(google.getProviderDetails().getUserInfoEndpoint().getUri())
                            .isEqualTo("https://openidconnect.googleapis.com/v1/userinfo");
                    assertThat(context.getBean(GmailProvider.class).oauth2().orElseThrow().revocationUri())
                            .isEqualTo(URI.create("https://oauth2.googleapis.com/revoke"));
                    assertThat(context.getBean(GmailProperties.class).gmailApiUri())
                            .isEqualTo(URI.create("https://gmail.googleapis.com"));
                });
    }

    @Test
    void testsCanPointGoogleSomewhereElse() {
        contextRunner.withPropertyValues("sino.google.client-id=" + CLIENT_ID,
                "sino.google.client-secret=" + CLIENT_SECRET,
                "sino.google.authorization-uri=http://localhost:9999/auth",
                "sino.google.token-uri=http://localhost:9999/token",
                "sino.google.user-info-uri=http://localhost:9999/userinfo",
                "sino.google.revocation-uri=http://localhost:9999/revoke",
                "sino.google.gmail-api-uri=http://localhost:9999").run(context -> {
                    ClientRegistration google = context.getBean(ClientRegistration.class);
                    assertThat(google.getProviderDetails().getAuthorizationUri())
                            .isEqualTo("http://localhost:9999/auth");
                    assertThat(google.getProviderDetails().getTokenUri()).isEqualTo("http://localhost:9999/token");
                    assertThat(google.getProviderDetails().getUserInfoEndpoint().getUri())
                            .isEqualTo("http://localhost:9999/userinfo");
                    assertThat(context.getBean(GmailProvider.class).oauth2().orElseThrow().revocationUri())
                            .isEqualTo(URI.create("http://localhost:9999/revoke"));
                    assertThat(context.getBean(GmailProperties.class).gmailApiUri())
                            .isEqualTo(URI.create("http://localhost:9999"));
                });
    }

    @Test
    void doesNotStartWithOnlyTheClientId() {
        contextRunner.withPropertyValues("sino.google.client-id=" + CLIENT_ID).run(context -> {
            assertThat(context).getFailure().hasStackTraceContaining("SINO_GOOGLE_CLIENT_SECRET");
            assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(CLIENT_ID);
        });
    }

    @Test
    void doesNotStartWithOnlyTheClientSecret() {
        contextRunner.withPropertyValues("sino.google.client-secret=" + CLIENT_SECRET).run(context -> {
            assertThat(context).getFailure().hasStackTraceContaining("SINO_GOOGLE_CLIENT_ID");
            assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(CLIENT_SECRET);
        });
    }

    // The connect flow builds the redirect URI from SINO_PUBLIC_BASE_URL (BE-31): with Gmail on, the app needs it.
    @Test
    void doesNotStartWithGmailOnAndNoPublicBaseUrl() {
        ApplicationContextRunner gmailOn = contextRunner.withUserConfiguration(ConnectFlow.class)
                .withPropertyValues("sino.google.client-id=" + CLIENT_ID, "sino.google.client-secret=" + CLIENT_SECRET);

        gmailOn.run(context -> assertThat(context).getFailure().hasStackTraceContaining("SINO_PUBLIC_BASE_URL"));
        gmailOn.withPropertyValues("sino.public-base-url=http://localhost:5173")
                .run(context -> assertThat(context).hasNotFailed().hasSingleBean(OAuth2Clients.class));
    }

    @Test
    void gmailTellsSinoOfChangesWithAPubSubTopic(CapturedOutput output) {
        contextRunner.withPropertyValues("sino.google.client-id=" + CLIENT_ID,
                "sino.google.client-secret=" + CLIENT_SECRET, "sino.google.pubsub.topic=" + TOPIC).run(context -> {
                    assertThat(context.getBean(GmailProvider.class).capabilities().supports(PUSH_WEBHOOK)).isTrue();
                    assertThat(context.getBean(GmailProperties.class).pubsub().topic()).isEqualTo(TOPIC);
                });
        assertThat(output).doesNotContain("only polled");
    }

    @Test
    void withoutATopicGmailIsOnlyPolledAndSaysSo(CapturedOutput output) {
        contextRunner.withPropertyValues("sino.google.client-id=" + CLIENT_ID,
                "sino.google.client-secret=" + CLIENT_SECRET, "sino.google.pubsub.topic= ").run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(GmailProvider.class).capabilities().supports(PUSH_WEBHOOK)).isFalse();
                    assertThat(context.getBean(GmailProperties.class).pubsub().topic()).isNull();
                });
        assertThat(output).contains("only polled").contains("SINO_GOOGLE_PUBSUB_TOPIC");
    }

    @ParameterizedTest
    @ValueSource(strings = { "gmail", "projects/sino-test/gmail", "projects/sino-test/topics/",
        "projects//topics/gmail", "projects/sino test/topics/gmail", "projects/a/topics/b/c" })
    void doesNotStartWithATopicThatIsNotAFullName(String topic) {
        contextRunner.withPropertyValues("sino.google.client-id=" + CLIENT_ID,
                "sino.google.client-secret=" + CLIENT_SECRET, "sino.google.pubsub.topic=" + topic)
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("SINO_GOOGLE_PUBSUB_TOPIC"));
    }

    @Test
    void neverPrintsTheClientSecret() {
        GmailProperties properties = new GmailProperties(CLIENT_ID, CLIENT_SECRET, null, null, null, null, null,
                null);

        assertThat(properties.toString()).contains(CLIENT_ID).doesNotContain(CLIENT_SECRET);
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ConnectProperties.class)
    @Import(OAuth2Clients.class)
    static class ConnectFlow {
    }

    private static String stackTraceOf(Throwable failure) {
        StringWriter out = new StringWriter();
        failure.printStackTrace(new PrintWriter(out));
        return out.toString();
    }

}
