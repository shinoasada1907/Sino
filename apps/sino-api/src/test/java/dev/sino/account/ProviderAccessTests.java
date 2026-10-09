package dev.sino.account;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static dev.sino.provider.spi.ProviderErrorCode.AUTH_EXPIRED;
import static dev.sino.provider.spi.ProviderErrorCode.PROVIDER_UNAVAILABLE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountErrorCode;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.account.infrastructure.CredentialSnapshot;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.common.error.SinoException;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderRegistryErrorCode;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Another module calls a connector through {@link ProviderAccess} and never sees a token (D-62). WireMock stands in
 * for Google's token endpoint; the calls under test stand in for the connector.
 */
@SpringBootTest(properties = { "sino.google.client-id=1234567890-test.apps.googleusercontent.test",
        "sino.google.client-secret=GOCSPX-test-client-secret-value" })
@Import({ TestcontainersConfiguration.class, ProviderAccessTests.ChatConnector.class })
@ActiveProfiles("test")
@RecordApplicationEvents
@ExtendWith(OutputCaptureExtension.class)
class ProviderAccessTests {

    private static final String CLIENT_SECRET = "GOCSPX-test-client-secret-value";
    private static final Set<String> SCOPES = Set.of("openid", "https://www.googleapis.com/auth/gmail.readonly");
    private static final String GOOGLE_ID = "110248495921238986420";
    private static final String ACCESS = "ya29.stored-access-token";
    private static final String REFRESH = "1//stored-refresh-token";
    private static final String REFRESHED = "ya29.refreshed-access-token";
    private static final String RECONNECTED = "ya29.reconnected-access-token";

    private static final WireMockServer google = new WireMockServer(options().dynamicPort());
    // Runs while Google handles a refresh, before it answers.
    private static volatile Runnable duringTheRefresh;

    @Autowired
    private ProviderAccess access;

    @Autowired
    private AccountRegistrationService registration;

    @MockitoSpyBean
    private CredentialStore credentials;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ApplicationEvents events;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private final List<ProviderContext> seen = new ArrayList<>();
    private UUID owner;

    @DynamicPropertySource
    static void googleIsWireMock(DynamicPropertyRegistry registry) {
        if (!google.isRunning()) {
            google.start();
            google.addMockServiceRequestListener((request, response) -> {
                Runnable action = duringTheRefresh;
                if (request.getUrl().startsWith("/token") && action != null) {
                    action.run();
                }
            });
        }
        registry.add("sino.google.token-uri", () -> google.baseUrl() + "/token");
        registry.add("sino.google.revocation-uri", () -> google.baseUrl() + "/revoke");
    }

    @AfterAll
    static void stopGoogle() {
        google.stop();
    }

    @BeforeEach
    void startFromNoAccounts() {
        google.resetAll();
        duringTheRefresh = null;
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    @Test
    void aLiveTokenIsUsedAsItIs() {
        UUID gmail = gmailAccount(inAnHour());

        String result = access.call(gmail, this::answer);

        assertThat(result).isEqualTo("gmail");
        assertThat(seen).singleElement().satisfies(context -> {
            assertThat(context.accountId()).isEqualTo(gmail);
            assertThat(context.externalAccountId()).isEqualTo(GOOGLE_ID);
            assertThat(tokenOf(context)).isEqualTo(ACCESS);
        });
        google.verify(0, anyRequestedFor(anyUrl()));
    }

    @Test
    void aTokenAboutToExpireIsRefreshedFirstAndStoredEncrypted(CapturedOutput output) {
        UUID gmail = gmailAccount(inHalfAMinute());
        googleRefreshes();

        access.call(gmail, this::answer);

        assertThat(tokensSeen()).containsExactly(REFRESHED);
        google.verify(1, postRequestedFor(urlPathEqualTo("/token"))
                .withFormParam("grant_type", equalTo("refresh_token"))
                .withFormParam("refresh_token", equalTo(REFRESH)));
        CredentialSnapshot stored = credentials.snapshot(gmail).orElseThrow();
        OAuth2Credentials token = (OAuth2Credentials) stored.credential();
        assertThat(token.accessToken()).isEqualTo(REFRESHED);
        assertThat(token.expiresAt()).isAfter(Instant.now().plus(Duration.ofMinutes(59)));
        assertThat(token.scopes()).as("Google sent no scope, so the old ones stay").isEqualTo(SCOPES);
        assertThat(stored.refreshToken()).as("Google sent no refresh token, so the old one stays").isEqualTo(REFRESH);
        assertThat(credentialRowOf(gmail)).doesNotContain(REFRESHED).doesNotContain(REFRESH);
        assertNoSecretIn(output);
    }

    @Test
    void aRefusedTokenIsRefreshedAndTheCallRunsOnceMore() {
        UUID gmail = gmailAccount(inAnHour());
        googleRefreshes();

        String result = access.call(gmail, refused(1));

        assertThat(result).isEqualTo("ok");
        assertThat(tokensSeen()).containsExactly(ACCESS, REFRESHED);
        google.verify(1, postRequestedFor(urlPathEqualTo("/token")));
        assertThat(statusOf(gmail)).isEqualTo("CONNECTED");
        assertThat(events.stream(AccountStatusChanged.class)).isEmpty();
    }

    @Test
    void aFreshTokenRefusedAgainEndsTheAuthorization(CapturedOutput output) {
        UUID gmail = gmailAccount(inAnHour());
        googleRefreshes();

        assertThatAuthExpired(() -> access.call(gmail, refused(2)));

        assertThat(tokensSeen()).containsExactly(ACCESS, REFRESHED);
        google.verify(1, postRequestedFor(urlPathEqualTo("/token")));
        assertThat(statusOf(gmail)).isEqualTo("AUTH_EXPIRED");
        assertThat(events.stream(AccountStatusChanged.class)).singleElement().satisfies(change -> {
            assertThat(change.accountId()).isEqualTo(gmail);
            assertThat(change.from()).isEqualTo(AccountStatus.CONNECTED);
            assertThat(change.to()).isEqualTo(AccountStatus.AUTH_EXPIRED);
        });
        assertThat(output.getAll()).contains("Account " + gmail + " (gmail) must be reconnected");
        assertNoSecretIn(output);
    }

    @Test
    void aRefusedRefreshTokenEndsTheAuthorizationWithoutCallingTheConnector(CapturedOutput output) {
        UUID gmail = gmailAccount(inHalfAMinute());
        google.stubFor(post(urlPathEqualTo("/token")).willReturn(aResponse().withStatus(400)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"error\": \"invalid_grant\", \"error_description\": \"Token has been revoked.\"}")));

        assertThatAuthExpired(() -> access.call(gmail, this::answer));

        assertThat(seen).isEmpty();
        assertThat(statusOf(gmail)).isEqualTo("AUTH_EXPIRED");
        assertThat(events.stream(AccountStatusChanged.class)).singleElement()
                .satisfies(change -> assertThat(change.toString()).doesNotContain(ACCESS).doesNotContain(REFRESH));
        assertNoSecretIn(output);
    }

    @Test
    void aTokenJustRefreshedAndRefusedIsNotRefreshedAgain() {
        UUID gmail = gmailAccount(inHalfAMinute());
        googleRefreshes();

        assertThatAuthExpired(() -> access.call(gmail, refused(1)));

        assertThat(tokensSeen()).containsExactly(REFRESHED);
        google.verify(1, postRequestedFor(urlPathEqualTo("/token")));
        assertThat(statusOf(gmail)).isEqualTo("AUTH_EXPIRED");
    }

    @Test
    void aFailingTokenEndpointLeavesTheAccountAsItWas(CapturedOutput output) {
        UUID gmail = gmailAccount(inHalfAMinute());
        google.stubFor(post(urlPathEqualTo("/token")).willReturn(aResponse().withStatus(503)));

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> access.call(gmail, this::answer))
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(PROVIDER_UNAVAILABLE));

        assertThat(output.getAll()).contains("Could not refresh the token of account " + gmail + " (gmail)");
        assertThat(seen).isEmpty();
        assertThat(statusOf(gmail)).isEqualTo("CONNECTED");
        assertThat(events.stream(AccountStatusChanged.class)).isEmpty();
        assertThat(((OAuth2Credentials) credentials.snapshot(gmail).orElseThrow().credential()).accessToken())
                .isEqualTo(ACCESS);
    }

    @Test
    void anAccountThatMustBeReconnectedFailsWithoutCallingAnything() {
        UUID gmail = gmailAccount(inHalfAMinute());
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", gmail);

        assertThatAuthExpired(() -> access.call(gmail, this::answer));

        assertThat(seen).isEmpty();
        google.verify(0, anyRequestedFor(anyUrl()));
    }

    @Test
    void aRemovedOrUnknownAccountIsNotFound() {
        UUID gmail = gmailAccount(inAnHour());
        jdbc.update("update connected_account set removed_at = now() where id = ?", gmail);

        assertThatNotFound(() -> access.call(gmail, this::answer));
        assertThatNotFound(() -> access.call(UUID.randomUUID(), this::answer));
        assertThat(seen).isEmpty();
    }

    @Test
    void anAccountWhoseConnectorIsGoneHasAnUnknownProvider() {
        UUID gmail = gmailAccount(inAnHour());
        jdbc.update("update connected_account set provider = 'gone' where id = ?", gmail);

        assertThatExceptionOfType(SinoException.class).isThrownBy(() -> access.call(gmail, this::answer))
                .satisfies(failure -> assertThat(failure.errorCode())
                        .isEqualTo(ProviderRegistryErrorCode.UNKNOWN_PROVIDER));
        assertThat(seen).isEmpty();
    }

    @Test
    void aRefusedPlainTokenEndsTheAuthorization() {
        UUID chat = registration.register(new RegisterAccountCommand(owner, ProviderType.of("fake-chat"),
                new AccountProfile("chat-1", "Chat", null), new TokenCredentials("chat-bot-token-1"), null));

        assertThatAuthExpired(() -> access.call(chat, refused(1)));

        assertThat(tokensSeen()).containsExactly("chat-bot-token-1");
        google.verify(0, anyRequestedFor(anyUrl()));
        assertThat(statusOf(chat)).isEqualTo("AUTH_EXPIRED");
    }

    @Test
    void aRefusedTokenWithoutARefreshTokenEndsTheAuthorization() {
        UUID gmail = registration.register(new RegisterAccountCommand(owner, ProviderType.of("gmail"),
                new AccountProfile(GOOGLE_ID, "owner@gmail.test", null),
                new OAuth2Credentials(ACCESS, inAnHour(), SCOPES), null));

        assertThatAuthExpired(() -> access.call(gmail, refused(1)));

        assertThat(tokensSeen()).containsExactly(ACCESS);
        google.verify(0, anyRequestedFor(anyUrl()));
        assertThat(statusOf(gmail)).isEqualTo("AUTH_EXPIRED");
    }

    @Test
    void anOAuth2TokenOfAConnectorWithoutOAuth2CannotBeRefreshed() {
        UUID chat = registration.register(new RegisterAccountCommand(owner, ProviderType.of("fake-chat"),
                new AccountProfile("chat-1", "Chat", null), new OAuth2Credentials(ACCESS, inHalfAMinute(), SCOPES),
                REFRESH));

        assertThatAuthExpired(() -> access.call(chat, refused(1)));

        assertThat(tokensSeen()).containsExactly(ACCESS);
        google.verify(0, anyRequestedFor(anyUrl()));
        assertThat(statusOf(chat)).isEqualTo("AUTH_EXPIRED");
    }

    @Test
    void anotherProviderFailurePassesThroughUntouched() {
        UUID gmail = gmailAccount(inAnHour());
        ProviderException throttled = ProviderException.rateLimited("Slow down", Duration.ofSeconds(30));

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> access.call(gmail, (connector, context) -> {
            seen.add(context);
            throw throttled;
        })).isSameAs(throttled);

        assertThat(seen).hasSize(1);
        google.verify(0, anyRequestedFor(anyUrl()));
        assertThat(statusOf(gmail)).isEqualTo("CONNECTED");
    }

    @Test
    void aCredentialWrittenDuringTheRefreshWinsOverIt() {
        UUID gmail = gmailAccount(inHalfAMinute());
        googleRefreshes();
        OAuth2Credentials reconnected = new OAuth2Credentials(RECONNECTED, inAnHour(), SCOPES);
        duringTheRefresh = () -> credentials.save(gmail, reconnected, "1//reconnected-refresh-token");

        access.call(gmail, this::answer);

        assertThat(tokensSeen()).containsExactly(RECONNECTED);
        CredentialSnapshot stored = credentials.snapshot(gmail).orElseThrow();
        assertThat(stored.credential()).isEqualTo(reconnected);
        assertThat(stored.refreshToken()).isEqualTo("1//reconnected-refresh-token");
    }

    @Test
    void aCredentialWrittenJustBeforeTheRefreshIsStoredWinsOverIt() {
        UUID gmail = gmailAccount(inHalfAMinute());
        googleRefreshes();
        OAuth2Credentials reconnected = new OAuth2Credentials(RECONNECTED, inAnHour(), SCOPES);
        // The rare case the version check cannot see: another transaction writes between the check and the commit.
        doAnswer(invocation -> {
            CompletableFuture.runAsync(() -> credentials.save(gmail, reconnected, "1//reconnected-refresh-token"))
                    .join();
            throw new OptimisticLockingFailureException("The credential was written meanwhile");
        }).when(credentials).replaceIfUnchanged(eq(gmail), any(), any(), any());

        access.call(gmail, this::answer);

        assertThat(tokensSeen()).containsExactly(RECONNECTED);
    }

    @Test
    void aReconnectDuringARefusedRefreshIsNotUndone() {
        UUID gmail = gmailAccount(inHalfAMinute());
        google.stubFor(post(urlPathEqualTo("/token")).willReturn(aResponse().withStatus(400)
                .withHeader("Content-Type", "application/json").withBody("{\"error\": \"invalid_grant\"}")));
        OAuth2Credentials reconnected = new OAuth2Credentials(RECONNECTED, inAnHour(), SCOPES);
        duringTheRefresh = () -> credentials.save(gmail, reconnected, "1//reconnected-refresh-token");

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> access.call(gmail, this::answer))
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(PROVIDER_UNAVAILABLE));

        assertThat(statusOf(gmail)).isEqualTo("CONNECTED");
        assertThat(events.stream(AccountStatusChanged.class)).isEmpty();
        assertThat(credentials.snapshot(gmail).orElseThrow().credential()).isEqualTo(reconnected);
    }

    @Test
    void anAccountWrittenWhileItIsBeingMarkedIsLeftAsItIs() {
        UUID gmail = gmailAccount(inHalfAMinute());
        google.stubFor(post(urlPathEqualTo("/token")).willReturn(aResponse().withStatus(400)
                .withHeader("Content-Type", "application/json").withBody("{\"error\": \"invalid_grant\"}")));
        // Another transaction renames the account after it was read for marking and before the commit.
        doAnswer(invocation -> {
            CompletableFuture.runAsync(() -> jdbc.update(
                    "update connected_account set display_name = 'Renamed', version = version + 1 where id = ?",
                    gmail)).join();
            return invocation.callRealMethod();
        }).when(credentials).isCurrent(eq(gmail), any());

        assertThatExceptionOfType(ProviderException.class).isThrownBy(() -> access.call(gmail, this::answer))
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(PROVIDER_UNAVAILABLE));

        assertThat(statusOf(gmail)).isEqualTo("CONNECTED");
    }

    @Test
    void aCallInsideATransactionIsRefused() {
        UUID gmail = gmailAccount(inAnHour());
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);

        assertThatIllegalStateException()
                .isThrownBy(() -> transaction.execute(status -> access.call(gmail, this::answer)));

        assertThat(seen).isEmpty();
    }

    @Test
    void anAccountRemovedDuringTheRefreshGetsNoCredentialBack() {
        UUID gmail = gmailAccount(inHalfAMinute());
        googleRefreshes();
        duringTheRefresh = () -> {
            jdbc.update("update connected_account set removed_at = now() where id = ?", gmail);
            jdbc.update("delete from account_credential where account_id = ?", gmail);
        };

        assertThatNotFound(() -> access.call(gmail, this::answer));

        assertThat(seen).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from account_credential where account_id = ?", Long.class,
                gmail)).isZero();
    }

    private UUID gmailAccount(Instant expiresAt) {
        return registration.register(new RegisterAccountCommand(owner, ProviderType.of("gmail"),
                new AccountProfile(GOOGLE_ID, "owner@gmail.test", null),
                new OAuth2Credentials(ACCESS, expiresAt, SCOPES), REFRESH));
    }

    // The database keeps microseconds; whole seconds compare equal after a round trip.
    private static Instant inAnHour() {
        return Instant.now().plus(Duration.ofHours(1)).truncatedTo(ChronoUnit.SECONDS);
    }

    private static Instant inHalfAMinute() {
        return Instant.now().plusSeconds(30).truncatedTo(ChronoUnit.SECONDS);
    }

    private static void googleRefreshes() {
        google.stubFor(post(urlPathEqualTo("/token")).willReturn(okJson(
                "{\"access_token\": \"" + REFRESHED + "\", \"expires_in\": 3599, \"token_type\": \"Bearer\"}")));
    }

    private String answer(MessageProvider connector, ProviderContext context) {
        seen.add(context);
        return connector.type().value();
    }

    // A call the provider refuses the first {@code times} times, as a connector does on a 401.
    private ProviderCall<String> refused(int times) {
        return (connector, context) -> {
            seen.add(context);
            if (seen.size() <= times) {
                throw new ProviderException(AUTH_EXPIRED, "The provider answered 401");
            }
            return "ok";
        };
    }

    private List<String> tokensSeen() {
        return seen.stream().map(ProviderAccessTests::tokenOf).toList();
    }

    private static String tokenOf(ProviderContext context) {
        return switch (context.credentials()) {
            case OAuth2Credentials oauth -> oauth.accessToken();
            case TokenCredentials token -> token.token();
        };
    }

    private String statusOf(UUID accountId) {
        return jdbc.queryForObject("select status from connected_account where id = ?", String.class, accountId);
    }

    private String credentialRowOf(UUID accountId) {
        return jdbc.queryForObject("select row_to_json(c)::text from account_credential c where account_id = ?",
                String.class, accountId);
    }

    private static void assertThatAuthExpired(ThrowingCallable call) {
        assertThatExceptionOfType(ProviderException.class).isThrownBy(call)
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(AUTH_EXPIRED))
                .withMessageNotContaining(ACCESS).withMessageNotContaining(REFRESH);
    }

    private static void assertThatNotFound(ThrowingCallable call) {
        assertThatExceptionOfType(SinoException.class).isThrownBy(call)
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(AccountErrorCode.ACCOUNT_NOT_FOUND));
    }

    private static void assertNoSecretIn(CapturedOutput output) {
        assertThat(output.getAll()).doesNotContain(ACCESS).doesNotContain(REFRESH).doesNotContain(REFRESHED)
                .doesNotContain(CLIENT_SECRET);
    }

    @TestConfiguration
    static class ChatConnector {

        @Bean
        FakeMessageProvider chatConnector() {
            return FakeMessageProvider.builder("fake-chat").build();
        }

    }

}
