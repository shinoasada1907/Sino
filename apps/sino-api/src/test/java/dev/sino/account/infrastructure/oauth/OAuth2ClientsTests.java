package dev.sino.account.infrastructure.oauth;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.assertj.core.api.ThrowableAssertAlternative;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.security.oauth2.core.endpoint.PkceParameterNames;
import org.springframework.util.MultiValueMap;
import org.springframework.web.util.UriComponentsBuilder;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;

import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;

class OAuth2ClientsTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final String GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
    private static final String CODE = "4/0Ab-sample-authorization-code";
    private static final String TOKENS = """
            {"access_token": "ya29.exchanged-access-token", "expires_in": 3599, "token_type": "Bearer",
             "refresh_token": "1//exchanged-refresh-token",
             "scope": "openid https://www.googleapis.com/auth/userinfo.email %s"}
            """.formatted(GMAIL_READONLY);

    private static WireMockServer tokenEndpoint;
    private static final OAuth2Connection GMAIL_LIKE = new OAuth2Connection("google",
            Set.of("openid", "email", "https://www.googleapis.com/auth/gmail.readonly"),
            Set.of("https://www.googleapis.com/auth/gmail.readonly"),
            Map.of("access_type", "offline", "prompt", "consent"), URI.create("https://auth.test/revoke"));
    private static final ClientRegistration GOOGLE = ClientRegistration.withRegistrationId("google")
            .clientId("client-1")
            .clientSecret("client-secret-1")
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .redirectUri("{baseUrl}/not-used")
            .authorizationUri("https://auth.test/authorize")
            .tokenUri("https://auth.test/token")
            .build();

    private final MessageProvider gmail = FakeMessageProvider.builder("gmail").oauth2(GMAIL_LIKE).build();

    @BeforeAll
    static void startTheTokenEndpoint() {
        tokenEndpoint = new WireMockServer(options().dynamicPort());
        tokenEndpoint.start();
    }

    @AfterAll
    static void stopTheTokenEndpoint() {
        tokenEndpoint.stop();
    }

    @BeforeEach
    void forgetEarlierCalls() {
        tokenEndpoint.resetAll();
    }

    @Test
    void asksTheProviderForConsentWithStateAndPkce() throws Exception {
        OAuth2AuthorizationRequest request = clients("http://localhost:5173").authorizationRequest(GMAIL, GMAIL_LIKE,
                null);

        String url = request.getAuthorizationRequestUri();
        Map<String, String> query = queryOf(url);
        assertThat(url).startsWith("https://auth.test/authorize?");
        assertThat(query).containsEntry("response_type", "code")
                .containsEntry("client_id", "client-1")
                .containsEntry("redirect_uri", "http://localhost:5173/api/accounts/connect/gmail/callback")
                .containsEntry("access_type", "offline")
                .containsEntry("prompt", "consent")
                .containsEntry("code_challenge_method", "S256")
                .doesNotContainKey("login_hint");
        assertThat(query.get("scope").split(" ")).containsExactlyInAnyOrder("openid", "email",
                "https://www.googleapis.com/auth/gmail.readonly");
        assertThat(query.get("state")).matches("[A-Za-z0-9_-]{43}").isEqualTo(request.getState());
        String verifier = request.getAttribute(PkceParameterNames.CODE_VERIFIER);
        assertThat(query.get("code_challenge")).isEqualTo(s256(verifier));
        assertThat((String) request.getAttribute(OAuth2ParameterNames.REGISTRATION_ID)).isEqualTo("google");
    }

    @Test
    void asksForTheAccountBeingReconnected() {
        OAuth2AuthorizationRequest request = clients("http://localhost:5173").authorizationRequest(GMAIL, GMAIL_LIKE,
                "110248495921238986420");

        assertThat(queryOf(request.getAuthorizationRequestUri())).containsEntry("login_hint", "110248495921238986420");
    }

    @Test
    void everyRequestHasItsOwnStateAndVerifier() {
        OAuth2Clients clients = clients("http://localhost:5173");

        OAuth2AuthorizationRequest first = clients.authorizationRequest(GMAIL, GMAIL_LIKE, null);
        OAuth2AuthorizationRequest second = clients.authorizationRequest(GMAIL, GMAIL_LIKE, null);

        assertThat(second.getState()).isNotEqualTo(first.getState());
        assertThat((String) second.getAttribute(PkceParameterNames.CODE_VERIFIER))
                .isNotEqualTo(first.getAttribute(PkceParameterNames.CODE_VERIFIER));
    }

    @Test
    void aTrailingSlashOnTheBaseUrlIsDropped() {
        OAuth2AuthorizationRequest request = clients("http://localhost:5173/").authorizationRequest(GMAIL, GMAIL_LIKE,
                null);

        assertThat(request.getRedirectUri()).isEqualTo("http://localhost:5173/api/accounts/connect/gmail/callback");
    }

    @ParameterizedTest
    @ValueSource(strings = { "", " ", "localhost:5173", "ftp://files.test", "http://localhost:5173/?next=x",
            "http://localhost:5173/#top" })
    void anOAuth2ConnectorNeedsAUsablePublicBaseUrl(String baseUrl) {
        assertThatIllegalStateException().isThrownBy(() -> clients(baseUrl))
                .withMessageContaining("SINO_PUBLIC_BASE_URL");
    }

    @Test
    void withoutAnOAuth2ConnectorNoBaseUrlIsNeeded() {
        new OAuth2Clients(List.of(FakeMessageProvider.builder("fake").build()), List.of(), new ConnectProperties(null));
    }

    @Test
    void aConnectorWhoseOAuthClientIsMissingStopsTheStartup() {
        assertThatIllegalStateException()
                .isThrownBy(() -> new OAuth2Clients(List.of(gmail), List.of(),
                        new ConnectProperties("http://localhost:5173")))
                .withMessageContaining("google")
                .withMessageContaining("gmail");
    }

    @Test
    void twoOAuthClientsWithTheSameIdStopTheStartupWithoutShowingASecret() {
        ClientRegistration secondGoogle = ClientRegistration.withClientRegistration(GOOGLE)
                .clientSecret("client-secret-2")
                .build();

        assertThatIllegalStateException()
                .isThrownBy(() -> new OAuth2Clients(List.of(gmail), List.of(GOOGLE, secondGoogle),
                        new ConnectProperties("http://localhost:5173")))
                .withMessageContaining("google")
                .withMessageNotContaining("client-secret-1")
                .withMessageNotContaining("client-secret-2");
    }

    @Test
    void exchangesTheCodeWithTheVerifierAndTheRedirectUriItAskedWith() {
        answer(okJson(TOKENS));
        OAuth2Clients clients = exchanging(Duration.ofSeconds(5));
        OAuth2AuthorizationRequest request = clients.authorizationRequest(GMAIL, GMAIL_LIKE, null);

        OAuth2Tokens tokens = clients.exchange(request, CODE);

        assertThat(tokens.accessToken()).isEqualTo("ya29.exchanged-access-token");
        assertThat(tokens.refreshToken()).isEqualTo("1//exchanged-refresh-token");
        assertThat(tokens.grantedScopes()).containsExactlyInAnyOrder("openid",
                "https://www.googleapis.com/auth/userinfo.email", GMAIL_READONLY);
        assertThat(tokens.expiresAt()).isBetween(Instant.now().plusSeconds(3500), Instant.now().plusSeconds(3600));
        tokenEndpoint.verify(postRequestedFor(urlPathEqualTo("/token"))
                .withHeader("Authorization", equalTo("Basic " + Base64.getEncoder()
                        .encodeToString("client-1:client-secret-1".getBytes(StandardCharsets.UTF_8))))
                .withFormParam("grant_type", equalTo("authorization_code"))
                .withFormParam("code", equalTo(CODE))
                .withFormParam("redirect_uri", equalTo("http://localhost:5173/api/accounts/connect/gmail/callback"))
                .withFormParam("code_verifier", equalTo(request.getAttribute(PkceParameterNames.CODE_VERIFIER))));
    }

    // RFC 6749 section 5.1: the scope may be left out when it is the one asked for.
    @Test
    void anAnswerWithoutAScopeGrantsTheScopesAskedFor() {
        answer(okJson("""
                {"access_token": "ya29.exchanged-access-token", "token_type": "Bearer",
                 "refresh_token": "1//exchanged-refresh-token"}
                """));
        OAuth2Clients clients = exchanging(Duration.ofSeconds(5));

        OAuth2Tokens tokens = clients.exchange(clients.authorizationRequest(GMAIL, GMAIL_LIKE, null), CODE);

        assertThat(tokens.grantedScopes()).containsExactlyInAnyOrderElementsOf(GMAIL_LIKE.scopes());
    }

    @Test
    void anAnswerWithoutARefreshTokenHasNone() {
        answer(okJson("""
                {"access_token": "ya29.exchanged-access-token", "token_type": "Bearer", "scope": "openid"}
                """));
        OAuth2Clients clients = exchanging(Duration.ofSeconds(5));

        assertThat(clients.exchange(clients.authorizationRequest(GMAIL, GMAIL_LIKE, null), CODE).refreshToken())
                .isNull();
    }

    @Test
    void aRefusedCodeNamesTheOAuthErrorOnly() {
        answer(aResponse().withStatus(400).withHeader("Content-Type", "application/json")
                .withBody("{\"error\": \"invalid_grant\", \"error_description\": \"Bad code ya29.leaked\"}"));

        assertThatExchangeFailure().withMessageContaining("invalid_grant").withMessageNotContaining("ya29.leaked");
    }

    @Test
    void aServerErrorNamesTheHttpStatusOnly() {
        answer(aResponse().withStatus(503).withBody("down, see ya29.leaked"));

        assertThatExchangeFailure().withMessageContaining("503").withMessageNotContaining("ya29.leaked");
    }

    @Test
    void anAnswerSinoCannotReadIsAFailure() {
        answer(aResponse().withStatus(200).withHeader("Content-Type", "application/json").withBody("not json"));

        assertThatExchangeFailure();
    }

    @Test
    void aSlowTokenEndpointFailsWithinTheReadTimeout() {
        answer(okJson(TOKENS).withFixedDelay(3000));
        OAuth2Clients clients = exchanging(Duration.ofMillis(300));
        OAuth2AuthorizationRequest request = clients.authorizationRequest(GMAIL, GMAIL_LIKE, null);
        long start = System.nanoTime();

        assertThatExceptionOfType(OAuth2ExchangeException.class).isThrownBy(() -> clients.exchange(request, CODE))
                .withMessageNotContaining(CODE);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
    }

    @Test
    void theTokensNeverShowInTheirText() {
        OAuth2Tokens tokens = new OAuth2Tokens("ya29.secret-access", null, Set.of("openid"), "1//secret-refresh");

        assertThat(tokens.toString()).doesNotContain("ya29.secret-access").doesNotContain("1//secret-refresh");
    }

    private static void answer(ResponseDefinitionBuilder response) {
        tokenEndpoint.stubFor(post(urlPathEqualTo("/token")).willReturn(response));
    }

    // Every failure message names the failure, never the code or the client secret.
    private ThrowableAssertAlternative<OAuth2ExchangeException> assertThatExchangeFailure() {
        OAuth2Clients clients = exchanging(Duration.ofSeconds(5));
        OAuth2AuthorizationRequest request = clients.authorizationRequest(GMAIL, GMAIL_LIKE, null);
        return assertThatExceptionOfType(OAuth2ExchangeException.class)
                .isThrownBy(() -> clients.exchange(request, CODE))
                .withMessageNotContaining(CODE)
                .withMessageNotContaining("client-secret-1");
    }

    private OAuth2Clients exchanging(Duration readTimeout) {
        ClientRegistration google = ClientRegistration.withClientRegistration(GOOGLE)
                .tokenUri(tokenEndpoint.baseUrl() + "/token")
                .build();
        return new OAuth2Clients(List.of(gmail), List.of(google), new ConnectProperties("http://localhost:5173"),
                Duration.ofSeconds(2), readTimeout);
    }

    private OAuth2Clients clients(String publicBaseUrl) {
        return new OAuth2Clients(List.of(gmail), List.of(GOOGLE), new ConnectProperties(publicBaseUrl));
    }

    private static Map<String, String> queryOf(String url) {
        MultiValueMap<String, String> raw = UriComponentsBuilder.fromUriString(url).build().getQueryParams();
        return raw.toSingleValueMap().entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,
                entry -> URLDecoder.decode(entry.getValue(), StandardCharsets.UTF_8)));
    }

    private static String s256(String verifier) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }

}
