package dev.sino.account.api;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.util.UriComponentsBuilder;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.verification.LoggedRequest;

import dev.sino.Browser;
import dev.sino.Browser.Response;
import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountManagementService;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.OAuth2Credentials;

/**
 * The callback Google sends the browser back to, on a real server with a session cookie, and WireMock standing in
 * for Google's token, userinfo and revocation endpoints. Every outcome is a 302 to the web, never JSON.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = { "sino.google.client-id=1234567890-test.apps.googleusercontent.test",
                "sino.google.client-secret=GOCSPX-test-client-secret-value" })
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class ConnectCallbackTests {

    private static final String CLIENT_SECRET = "GOCSPX-test-client-secret-value";
    private static final String GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
    private static final String CODE = "4/0Ab-callback-test-code";
    private static final String ACCESS = "ya29.callback-test-access-token";
    private static final String REFRESH = "1//callback-test-refresh-token";
    private static final String SUB = "110248495921238986420";
    private static final String OTHER_SUB = "117000000000000000001";
    private static final Instant START = Instant.parse("2026-10-08T00:00:00Z");
    private static final AtomicLong HOURS = new AtomicLong();

    private static final WireMockServer google = new WireMockServer(options().dynamicPort());
    private static volatile Instant now = START;

    @MockitoBean
    private Clock clock;

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AccountManagementService management;

    @Autowired
    private AppUserRepository users;

    private Browser browser;

    @DynamicPropertySource
    static void googleIsWireMock(DynamicPropertyRegistry registry) {
        if (!google.isRunning()) {
            google.start();
        }
        registry.add("sino.google.token-uri", () -> google.baseUrl() + "/token");
        registry.add("sino.google.user-info-uri", () -> google.baseUrl() + "/v1/userinfo");
        registry.add("sino.google.revocation-uri", () -> google.baseUrl() + "/revoke");
    }

    @AfterAll
    static void stopGoogle() {
        google.stop();
    }

    @BeforeEach
    void signInWithNoAccountsAndAFreshGoogle() {
        now = START.plus(Duration.ofHours(HOURS.incrementAndGet()));
        given(clock.instant()).willAnswer(invocation -> now);
        google.resetAll();
        google.stubFor(post(urlPathEqualTo("/revoke")).willReturn(aResponse().withStatus(200)));
        jdbc.update("delete from connected_account");
        browser = new Browser("http://localhost:" + port);
        assertThat(browser.signIn("owner@sino.test", "test-owner-password", false).status()).isEqualTo(204);
    }

    @Test
    void connectsANewGmailAccount() throws Exception {
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");
        Map<String, String> consent = startGmail();

        Response callback = callback("code=" + CODE + "&state=" + consent.get("state"));

        UUID accountId = connectedAccountIn(callback);
        Response accounts = browser.get("/api/accounts");
        assertThat(accounts.value("$.length()")).isEqualTo(1);
        assertThat(accounts.json("$[0].id")).isEqualTo(accountId.toString());
        assertThat(accounts.json("$[0].provider")).isEqualTo("gmail");
        assertThat(accounts.json("$[0].externalAccountId")).isEqualTo(SUB);
        assertThat(accounts.json("$[0].displayName")).isEqualTo("owner@gmail.test");
        assertThat(accounts.json("$[0].status")).isEqualTo("CONNECTED");
        String storedRefreshToken = jdbc.queryForObject(
                "select refresh_token_enc from account_credential where account_id = ?", String.class, accountId);
        assertThat(storedRefreshToken).as("refresh token, encrypted").isNotBlank().doesNotContain(REFRESH);
        String verifier = tokenRequest().get("code_verifier");
        assertThat(s256(verifier)).as("the verifier kept in the session matches the challenge sent to Google")
                .isEqualTo(consent.get("code_challenge"));
        assertThat(tokenRequest()).containsEntry("code", CODE)
                .containsEntry("redirect_uri", "http://localhost:5173/api/accounts/connect/gmail/callback");
        google.verify(getRequestedFor(urlPathEqualTo("/v1/userinfo"))
                .withHeader("Authorization", equalTo("Bearer " + ACCESS)));
        google.verify(0, postRequestedFor(urlPathEqualTo("/revoke")));
    }

    @Test
    void theSameGoogleAccountConnectedTwiceStaysOneAccount() {
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");

        UUID first = connectedAccountIn(callback("code=" + CODE + "&state=" + startGmail().get("state")));
        UUID second = connectedAccountIn(callback("code=" + CODE + "&state=" + startGmail().get("state")));

        assertThat(second).isEqualTo(first);
        assertThat(browser.get("/api/accounts").value("$.length()")).isEqualTo(1);
    }

    @Test
    void reconnectsTheAccountWhoseAuthorizationRanOut() {
        UUID account = anExpiredGmailAccount(SUB);
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");

        Response callback = callback("code=" + CODE + "&state=" + reconnect(account).get("state"));

        assertThat(connectedAccountIn(callback)).isEqualTo(account);
        assertThat(browser.get("/api/accounts/" + account).json("$.status")).isEqualTo("CONNECTED");
    }

    @Test
    void reconnectingWithAnotherGoogleAccountChangesNothingAndRevokesTheGrant() {
        UUID account = anExpiredGmailAccount(SUB);
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs(OTHER_SUB, "someone@gmail.test");

        Response callback = callback("code=" + CODE + "&state=" + reconnect(account).get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_WRONG_ACCOUNT");
        Response accounts = browser.get("/api/accounts");
        assertThat(accounts.value("$.length()")).isEqualTo(1);
        assertThat(accounts.json("$[0].status")).isEqualTo("AUTH_EXPIRED");
        google.verify(postRequestedFor(urlPathEqualTo("/revoke")).withFormParam("token", equalTo(REFRESH)));
    }

    @Test
    void withoutTheGmailPermissionNothingIsCreatedAndTheGrantIsRevoked() {
        googleGivesTokens("", true);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");

        Response callback = callback("code=" + CODE + "&state=" + startGmail().get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_SCOPE_DENIED");
        assertThat(browser.get("/api/accounts").value("$.length()")).isEqualTo(0);
        google.verify(postRequestedFor(urlPathEqualTo("/revoke")).withFormParam("token", equalTo(REFRESH)));
    }

    // D-54: revoking drops everything that Google account granted Sino, so a connected account would lose its grant.
    @Test
    void choosingAnotherConnectedAccountWhenReconnectingKeepsThatAccountsGrant() {
        UUID expired = anExpiredGmailAccount(SUB);
        aConnectedGmailAccount(OTHER_SUB);
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs(OTHER_SUB, "someone@gmail.test");

        Response callback = callback("code=" + CODE + "&state=" + reconnect(expired).get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_WRONG_ACCOUNT");
        google.verify(0, postRequestedFor(urlPathEqualTo("/revoke")));
    }

    @Test
    void addingAConnectedAccountAgainWithoutTheGmailPermissionKeepsItsGrant() {
        aConnectedGmailAccount(SUB);
        googleGivesTokens("", true);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");

        Response callback = callback("code=" + CODE + "&state=" + startGmail().get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_SCOPE_DENIED");
        assertThat(browser.get("/api/accounts").json("$[0].status")).isEqualTo("CONNECTED");
        google.verify(0, postRequestedFor(urlPathEqualTo("/revoke")));
    }

    @Test
    void anAccountRemovedWhileItWasBeingReconnectedStaysRemoved() {
        UUID account = anExpiredGmailAccount(SUB);
        String state = reconnect(account).get("state");
        management.remove(owner(), account);
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");

        Response callback = callback("code=" + CODE + "&state=" + state);

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_FAILED");
        assertThat(browser.get("/api/accounts").value("$.length()")).isEqualTo(0);
        google.verify(postRequestedFor(urlPathEqualTo("/revoke")).withFormParam("token", equalTo(REFRESH)));
    }

    @Test
    void cancellingAtGoogleIsCancelledAndNeverAsksForATokenOrSpendsTheState() {
        String state = startGmail().get("state");

        Response callback = callback("error=access_denied&state=" + state);

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_CANCELLED");
        google.verify(0, postRequestedFor(urlPathEqualTo("/token")));
        assertThat(connectErrorIn(callback("error=access_denied&state=" + state)))
                .as("the state was taken by the first callback").isEqualTo("CONNECT_STATE_INVALID");
    }

    @Test
    void anotherErrorFromGoogleFails() {
        Response callback = callback("error=server_error&state=" + startGmail().get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_FAILED");
        google.verify(0, postRequestedFor(urlPathEqualTo("/token")));
    }

    @Test
    void aCallbackWithoutACodeFails() {
        assertThat(connectErrorIn(callback("state=" + startGmail().get("state")))).isEqualTo("CONNECT_FAILED");
    }

    @Test
    void aStateWorksOnce() {
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");
        String query = "code=" + CODE + "&state=" + startGmail().get("state");
        connectedAccountIn(callback(query));

        assertThat(connectErrorIn(callback(query))).isEqualTo("CONNECT_STATE_INVALID");
        google.verify(1, postRequestedFor(urlPathEqualTo("/token")));
    }

    @Test
    void aStateRunsOutAfterTenMinutes() {
        String state = startGmail().get("state");
        now = now.plus(Duration.ofMinutes(10));

        assertThat(connectErrorIn(callback("code=" + CODE + "&state=" + state))).isEqualTo("CONNECT_STATE_INVALID");
        google.verify(0, postRequestedFor(urlPathEqualTo("/token")));
    }

    @Test
    void anUnknownOrMissingStateIsInvalid() {
        startGmail();

        assertThat(connectErrorIn(callback("code=" + CODE + "&state=not-a-state")))
                .isEqualTo("CONNECT_STATE_INVALID");
        assertThat(connectErrorIn(callback("code=" + CODE))).isEqualTo("CONNECT_STATE_INVALID");
        google.verify(0, postRequestedFor(urlPathEqualTo("/token")));
    }

    @Test
    void aStateOfAnotherProviderIsInvalid() {
        String state = startGmail().get("state");

        Response callback = browser.get("/api/accounts/connect/fake/callback?code=" + CODE + "&state=" + state);

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_STATE_INVALID");
        google.verify(0, postRequestedFor(urlPathEqualTo("/token")));
    }

    @Test
    void withoutTheSessionTheCallbackIsInvalidNotUnauthorized() {
        String state = startGmail().get("state");
        Browser anotherBrowser = new Browser("http://localhost:" + port);

        Response callback = anotherBrowser.get("/api/accounts/connect/gmail/callback?code=" + CODE + "&state=" + state);

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_STATE_INVALID");
        google.verify(0, postRequestedFor(urlPathEqualTo("/token")));
    }

    @Test
    void aFailingTokenEndpointFailsAndTheLogSaysWhy(CapturedOutput output) {
        google.stubFor(post(urlPathEqualTo("/token")).willReturn(aResponse().withStatus(500).withBody("oops")));

        Response callback = callback("code=" + CODE + "&state=" + startGmail().get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_FAILED");
        assertThat(browser.get("/api/accounts").value("$.length()")).isEqualTo(0);
        assertThat(output).contains("HTTP 500");
    }

    @Test
    void tokensWithoutARefreshTokenFail() {
        googleGivesTokens(GMAIL_READONLY, false);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");

        Response callback = callback("code=" + CODE + "&state=" + startGmail().get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_FAILED");
        assertThat(browser.get("/api/accounts").value("$.length()")).isEqualTo(0);
        google.verify(postRequestedFor(urlPathEqualTo("/revoke")).withFormParam("token", equalTo(ACCESS)));
    }

    @Test
    void aFailingProfileFails() {
        googleGivesTokens(GMAIL_READONLY, true);
        google.stubFor(get(urlPathEqualTo("/v1/userinfo")).willReturn(aResponse().withStatus(503)));

        Response callback = callback("code=" + CODE + "&state=" + startGmail().get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_FAILED");
        assertThat(browser.get("/api/accounts").value("$.length()")).isEqualTo(0);
        google.verify(postRequestedFor(urlPathEqualTo("/revoke")).withFormParam("token", equalTo(REFRESH)));
    }

    @Test
    void anUnexpectedFailureWhileRegisteringStillEndsWithARedirect() {
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs("9".repeat(300), "owner@gmail.test");

        Response callback = callback("code=" + CODE + "&state=" + startGmail().get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_FAILED");
        assertThat(browser.get("/api/accounts").value("$.length()")).isEqualTo(0);
        google.verify(postRequestedFor(urlPathEqualTo("/revoke")).withFormParam("token", equalTo(REFRESH)));
    }

    // The error comes through the browser, so anyone can put anything in it.
    @Test
    void aStrangeErrorFromTheBrowserIsNotWrittenToTheLog(CapturedOutput output) {
        Response callback = callback("error=bad%0AFAKE-LOG-LINE&state=" + startGmail().get("state"));

        assertThat(connectErrorIn(callback)).isEqualTo("CONNECT_FAILED");
        assertThat(output).doesNotContain("FAKE-LOG-LINE").contains("(unrecognized)");
    }

    @Test
    void theRedirectNeverComesFromTheRequest() {
        Response callback = callback("error=access_denied&state=" + startGmail().get("state")
                + "&redirect_uri=https://evil.test/&next=https://evil.test/");

        assertThat(callback.header("Location")).hasValue("/accounts?connectError=CONNECT_CANCELLED");
    }

    @Test
    void theLogNeverShowsTheCodeATokenOrTheClientSecret(CapturedOutput output) {
        googleGivesTokens(GMAIL_READONLY, true);
        googleSaysTheAccountIs(SUB, "owner@gmail.test");
        connectedAccountIn(callback("code=" + CODE + "&state=" + startGmail().get("state")));
        googleGivesTokens("", true);
        connectErrorIn(callback("code=" + CODE + "&state=" + startGmail().get("state")));

        assertThat(output).doesNotContain(CODE).doesNotContain(ACCESS).doesNotContain(REFRESH)
                .doesNotContain(CLIENT_SECRET);
    }

    private Map<String, String> startGmail() {
        return consentQueryOf(browser.send("POST", "/api/accounts/connect/gmail", null, true));
    }

    private Map<String, String> reconnect(UUID accountId) {
        return consentQueryOf(browser.send("POST", "/api/accounts/connect/gmail",
                "{\"accountId\": \"" + accountId + "\"}", true));
    }

    private Response callback(String query) {
        return browser.get("/api/accounts/connect/gmail/callback?" + query);
    }

    private UUID anExpiredGmailAccount(String sub) {
        UUID account = aConnectedGmailAccount(sub);
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", account);
        return account;
    }

    private UUID aConnectedGmailAccount(String sub) {
        return registration.register(new RegisterAccountCommand(owner(), ProviderType.of("gmail"),
                new AccountProfile(sub, sub + "@gmail.test", null),
                new OAuth2Credentials("ya29.old-access-token", null, Set.of(GMAIL_READONLY)), "1//old-refresh"));
    }

    private UUID owner() {
        return users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    private static void googleGivesTokens(String extraScope, boolean withRefreshToken) {
        String scope = ("openid https://www.googleapis.com/auth/userinfo.email " + extraScope).strip();
        String refresh = withRefreshToken ? "\"refresh_token\": \"" + REFRESH + "\", " : "";
        google.stubFor(post(urlPathEqualTo("/token")).willReturn(okJson("{\"access_token\": \"" + ACCESS + "\", "
                + refresh + "\"expires_in\": 3599, \"token_type\": \"Bearer\", \"scope\": \"" + scope + "\"}")));
    }

    private static void googleSaysTheAccountIs(String sub, String email) {
        ResponseDefinitionBuilder userInfo = okJson("{\"sub\": \"" + sub + "\", \"email\": \"" + email
                + "\", \"email_verified\": true}");
        google.stubFor(get(urlPathEqualTo("/v1/userinfo")).willReturn(userInfo));
    }

    private static Map<String, String> tokenRequest() {
        List<LoggedRequest> requests = google.findAll(postRequestedFor(urlPathEqualTo("/token")));
        assertThat(requests).hasSize(1);
        return formOf(requests.getFirst().getBodyAsString());
    }

    private static UUID connectedAccountIn(Response callback) {
        assertThat(callback.status()).isEqualTo(302);
        String location = callback.header("Location").orElseThrow();
        assertThat(location).startsWith("/accounts?connected=");
        return UUID.fromString(location.substring("/accounts?connected=".length()));
    }

    private static String connectErrorIn(Response callback) {
        assertThat(callback.status()).isEqualTo(302);
        assertThat(callback.body()).isEmpty();
        String location = callback.header("Location").orElseThrow();
        assertThat(location).startsWith("/accounts?connectError=");
        return location.substring("/accounts?connectError=".length());
    }

    private static Map<String, String> consentQueryOf(Response start) {
        assertThat(start.status()).isEqualTo(200);
        String url = start.json("$.authorizationUrl");
        return UriComponentsBuilder.fromUriString(url).build().getQueryParams().toSingleValueMap().entrySet()
                .stream().collect(Collectors.toMap(Map.Entry::getKey,
                        entry -> URLDecoder.decode(entry.getValue(), StandardCharsets.UTF_8)));
    }

    private static Map<String, String> formOf(String body) {
        return Arrays.stream(body.split("&")).map(pair -> pair.split("=", 2)).collect(Collectors.toMap(
                pair -> URLDecoder.decode(pair[0], StandardCharsets.UTF_8),
                pair -> URLDecoder.decode(pair[1], StandardCharsets.UTF_8)));
    }

    private static String s256(String verifier) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }

}
