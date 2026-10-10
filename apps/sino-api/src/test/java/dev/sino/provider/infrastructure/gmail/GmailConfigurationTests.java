package dev.sino.provider.infrastructure.gmail;

import static dev.sino.provider.ProviderCapability.PUSH_WEBHOOK;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.URI;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
    private static final String AUDIENCE = "https://sino.test/api/webhooks/gmail";
    private static final String SERVICE_ACCOUNT = "gmail-push@sino-test.iam.gserviceaccount.com";
    private static final String PUBSUB_TOPIC = "sino.google.pubsub.topic=";
    private static final String PUBSUB_AUDIENCE = "sino.google.pubsub.audience=";
    private static final String PUBSUB_SERVICE_ACCOUNT = "sino.google.pubsub.service-account=";

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(GmailConfiguration.class, GmailPushController.class);

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
    void gmailTellsSinoOfChangesWithThePubSubSettings(CapturedOutput output) {
        withGmail(PUBSUB_TOPIC + TOPIC, PUBSUB_AUDIENCE + AUDIENCE, PUBSUB_SERVICE_ACCOUNT + SERVICE_ACCOUNT)
                .run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(GmailPushController.class);
                    assertThat(context.getBean(GmailProvider.class).capabilities().supports(PUSH_WEBHOOK)).isTrue();
                    GmailProperties.PubSub pubsub = context.getBean(GmailProperties.class).pubsub();
                    assertThat(pubsub.topic()).isEqualTo(TOPIC);
                    assertThat(pubsub.audience()).isEqualTo(AUDIENCE);
                    assertThat(pubsub.serviceAccount()).isEqualTo(SERVICE_ACCOUNT);
                    assertThat(pubsub.jwkSetUri()).isEqualTo(URI.create("https://www.googleapis.com/oauth2/v3/certs"));
                });
        assertThat(output).doesNotContain("only polled");
    }

    @Test
    void withoutThePubSubSettingsGmailIsOnlyPolledAndSaysSo(CapturedOutput output) {
        withGmail(PUBSUB_TOPIC + " ", PUBSUB_AUDIENCE, PUBSUB_SERVICE_ACCOUNT + " ").run(context -> {
            assertThat(context).hasNotFailed().doesNotHaveBean(GmailPushController.class);
            assertThat(context.getBean(GmailProvider.class).capabilities().supports(PUSH_WEBHOOK)).isFalse();
            assertThat(context.getBean(GmailProperties.class).pubsub().topic()).isNull();
        });
        assertThat(output).contains("only polled").contains("SINO_GOOGLE_PUBSUB_TOPIC")
                .contains("SINO_GOOGLE_PUBSUB_AUDIENCE").contains("SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT");
    }

    // Half a setup would register watches whose notices nobody can check.
    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "topic           | SINO_GOOGLE_PUBSUB_AUDIENCE, SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT",
        "audience        | SINO_GOOGLE_PUBSUB_TOPIC, SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT",
        "service-account | SINO_GOOGLE_PUBSUB_TOPIC, SINO_GOOGLE_PUBSUB_AUDIENCE",
        "topic,audience  | SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT",
        "audience,service-account | SINO_GOOGLE_PUBSUB_TOPIC",
        "topic,service-account | SINO_GOOGLE_PUBSUB_AUDIENCE" })
    void doesNotStartWithHalfThePubSubSettings(String given, String missing) {
        String[] settings = Arrays.stream(given.split(",")).map(name -> switch (name.strip()) {
            case "topic" -> PUBSUB_TOPIC + TOPIC;
            case "audience" -> PUBSUB_AUDIENCE + AUDIENCE;
            default -> PUBSUB_SERVICE_ACCOUNT + SERVICE_ACCOUNT;
        }).toArray(String[]::new);

        withGmail(settings).run(context -> {
            assertThat(context).getFailure().hasStackTraceContaining(missing + " missing");
            assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(AUDIENCE)
                    .doesNotContain(SERVICE_ACCOUNT).doesNotContain(TOPIC);
        });
    }

    @ParameterizedTest
    @ValueSource(strings = { "gmail", "projects/sino-test/gmail", "projects/sino-test/topics/",
        "projects//topics/gmail", "projects/sino test/topics/gmail", "projects/a/topics/b/c" })
    void doesNotStartWithATopicThatIsNotAFullName(String topic) {
        withGmail(PUBSUB_TOPIC + topic, PUBSUB_AUDIENCE + AUDIENCE, PUBSUB_SERVICE_ACCOUNT + SERVICE_ACCOUNT)
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("SINO_GOOGLE_PUBSUB_TOPIC (sino.google.pubsub.topic) must look like"));
    }

    @Test
    void withoutAGoogleClientThePubSubSettingsDoNothing() {
        contextRunner.withPropertyValues(PUBSUB_TOPIC + TOPIC, PUBSUB_AUDIENCE + AUDIENCE,
                PUBSUB_SERVICE_ACCOUNT + SERVICE_ACCOUNT).run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(GmailPushController.class);
                    assertThat(context).doesNotHaveBean(MessageProvider.class);
                });
    }

    @Test
    void doesNotStartWithAServiceAccountThatIsNotAnEmail() {
        withGmail(PUBSUB_TOPIC + TOPIC, PUBSUB_AUDIENCE + AUDIENCE, PUBSUB_SERVICE_ACCOUNT + "gmail-push")
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT"));
    }

    private ApplicationContextRunner withGmail(String... properties) {
        return contextRunner.withPropertyValues("sino.google.client-id=" + CLIENT_ID,
                "sino.google.client-secret=" + CLIENT_SECRET).withPropertyValues(properties);
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
