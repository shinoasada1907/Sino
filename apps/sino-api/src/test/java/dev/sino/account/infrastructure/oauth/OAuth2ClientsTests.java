package dev.sino.account.infrastructure.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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

import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;

class OAuth2ClientsTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final OAuth2Connection GMAIL_LIKE = new OAuth2Connection("google",
            Set.of("openid", "email", "https://www.googleapis.com/auth/gmail.readonly"),
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
