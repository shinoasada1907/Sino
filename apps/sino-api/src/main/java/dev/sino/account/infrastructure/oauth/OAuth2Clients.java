package dev.sino.account.infrastructure.oauth;

import java.net.URI;
import java.net.URISyntaxException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.converter.FormHttpMessageConverter;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.endpoint.OAuth2RefreshTokenGrantRequest;
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.RestClientRefreshTokenTokenResponseClient;
import org.springframework.security.oauth2.client.http.OAuth2ErrorResponseErrorHandler;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestCustomizers;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2AuthorizationException;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationExchange;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationResponse;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.security.oauth2.core.http.converter.OAuth2AccessTokenResponseHttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

/**
 * Sino's OAuth2 clients (D-38): finds the client a connector names, builds the consent request with a fresh
 * state, PKCE and the redirect URI of the connect flow, exchanges the code the provider sends back, and refreshes
 * an access token (F04b), with Spring doing the protocol. Checked at startup: every OAuth2 connector needs its
 * client and a public base URL, so a wrong setup stops the app instead of failing at the first connect.
 */
@Component
public class OAuth2Clients {

    static final String CALLBACK_PATH = "/api/accounts/connect/%s/callback";
    private static final String INVALID_GRANT = "invalid_grant";
    private static final int TOO_MANY_REQUESTS = 429;
    private static final int STATE_BYTES = 32;

    private final Map<String, ClientRegistration> registrations;
    private final String publicBaseUrl;
    private final SecureRandom random = new SecureRandom();
    private final RestClientAuthorizationCodeTokenResponseClient tokenClient =
            new RestClientAuthorizationCodeTokenResponseClient();
    private final RestClientRefreshTokenTokenResponseClient refreshClient =
            new RestClientRefreshTokenTokenResponseClient();

    // Spring passes an empty list when there is no client registration.
    @Autowired
    public OAuth2Clients(List<MessageProvider> providers, List<ClientRegistration> registrations,
            ConnectProperties properties) {
        this(providers, registrations, properties, TimedRequests.CONNECT_TIMEOUT, TimedRequests.READ_TIMEOUT);
    }

    OAuth2Clients(List<MessageProvider> providers, List<ClientRegistration> registrations,
            ConnectProperties properties, Duration connectTimeout, Duration readTimeout) {
        this.registrations = registrations.stream().collect(Collectors.toMap(ClientRegistration::getRegistrationId,
                Function.identity(), OAuth2Clients::duplicateClient));
        List<MessageProvider> oauth2Connectors = providers.stream().filter(p -> p.oauth2().isPresent()).toList();
        for (MessageProvider connector : oauth2Connectors) {
            String registrationId = connector.oauth2().orElseThrow().registrationId();
            if (!this.registrations.containsKey(registrationId)) {
                throw new IllegalStateException("Connector '" + connector.type() + "' connects with the OAuth client '"
                        + registrationId + "', which is not configured");
            }
        }
        this.publicBaseUrl = oauth2Connectors.isEmpty() ? null : checkedBaseUrl(properties.publicBaseUrl());
        // Spring's own client, plus time limits: what Spring sets up by default, on a request factory with timeouts.
        RestClient restClient = RestClient.builder()
                .requestFactory(TimedRequests.factory(connectTimeout, readTimeout))
                .configureMessageConverters(converters -> {
                    converters.addCustomConverter(new FormHttpMessageConverter());
                    converters.addCustomConverter(new OAuth2AccessTokenResponseHttpMessageConverter());
                })
                .defaultStatusHandler(new OAuth2ErrorResponseErrorHandler())
                .build();
        tokenClient.setRestClient(restClient);
        refreshClient.setRestClient(restClient);
    }

    /** The consent request for one connect; {@code loginHint} picks the account when reconnecting. */
    public OAuth2AuthorizationRequest authorizationRequest(ProviderType provider, OAuth2Connection connection,
            String loginHint) {
        ClientRegistration registration = registrations.get(connection.registrationId());
        OAuth2AuthorizationRequest.Builder builder = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri(registration.getProviderDetails().getAuthorizationUri())
                .clientId(registration.getClientId())
                .redirectUri(publicBaseUrl + CALLBACK_PATH.formatted(provider.value()))
                .scopes(connection.scopes())
                .state(newState())
                .additionalParameters(parameters -> {
                    parameters.putAll(connection.extraParameters());
                    if (loginHint != null) {
                        parameters.put("login_hint", loginHint);
                    }
                })
                .attributes(attributes -> attributes.put(OAuth2ParameterNames.REGISTRATION_ID,
                        registration.getRegistrationId()));
        OAuth2AuthorizationRequestCustomizers.withPkce().accept(builder);
        return builder.build();
    }

    /**
     * Exchanges the code the provider sent back, with the PKCE verifier and the redirect URI of {@code request}.
     *
     * @throws OAuth2ExchangeException when the token endpoint refuses, fails, is too slow, or answers nonsense
     */
    public OAuth2Tokens exchange(OAuth2AuthorizationRequest request, String code) {
        ClientRegistration registration = Objects.requireNonNull(
                registrations.get(request.<String>getAttribute(OAuth2ParameterNames.REGISTRATION_ID)),
                "the request names no configured OAuth client");
        OAuth2AuthorizationResponse response = OAuth2AuthorizationResponse.success(code)
                .redirectUri(request.getRedirectUri())
                .state(request.getState())
                .build();
        OAuth2AccessTokenResponse answer;
        try {
            answer = tokenClient.getTokenResponse(new OAuth2AuthorizationCodeGrantRequest(registration,
                    new OAuth2AuthorizationExchange(request, response)));
        } catch (OAuth2AuthorizationException failure) {
            throw new OAuth2ExchangeException(reasonOf(failure));
        }
        OAuth2AccessToken access = answer.getAccessToken();
        // RFC 6749 section 5.1: no scope in the answer means the scope asked for.
        Set<String> granted = access.getScopes().isEmpty() ? request.getScopes() : access.getScopes();
        return new OAuth2Tokens(access.getTokenValue(), access.getExpiresAt(), granted,
                answer.getRefreshToken() == null ? null : answer.getRefreshToken().getTokenValue());
    }

    /**
     * Asks the token endpoint of the client {@code registrationId} for a new access token. When the answer carries no
     * refresh token or no scope, the current ones are kept (Spring fills them in).
     *
     * @throws ProviderException with {@code AUTH_EXPIRED} when the provider no longer accepts the refresh token
     *         ({@code invalid_grant}); {@code PROVIDER_UNAVAILABLE} when the endpoint fails, is too slow or answers
     *         nonsense; {@code RATE_LIMITED} on HTTP 429; {@code REQUEST_REJECTED} when it refuses for another reason,
     *         such as Sino's own client being refused
     */
    public OAuth2Tokens refresh(String registrationId, OAuth2Credentials current, String refreshToken) {
        ClientRegistration registration = Objects.requireNonNull(registrations.get(registrationId),
                "no OAuth client is named " + registrationId);
        OAuth2AccessToken access = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, current.accessToken(),
                null, current.expiresAt(), current.scopes());
        OAuth2AccessTokenResponse answer;
        try {
            answer = refreshClient.getTokenResponse(new OAuth2RefreshTokenGrantRequest(registration, access,
                    new OAuth2RefreshToken(refreshToken, null)));
        } catch (OAuth2AuthorizationException failure) {
            throw refreshFailure(failure);
        }
        OAuth2AccessToken fresh = answer.getAccessToken();
        return new OAuth2Tokens(fresh.getTokenValue(), fresh.getExpiresAt(), fresh.getScopes(),
                answer.getRefreshToken().getTokenValue());
    }

    // Like reasonOf: the kind of failure only, never the provider's text.
    private static ProviderException refreshFailure(OAuth2AuthorizationException failure) {
        if (failure.getCause() == null) {
            String code = failure.getError().getErrorCode();
            return INVALID_GRANT.equals(code)
                    ? new ProviderException(ProviderErrorCode.AUTH_EXPIRED,
                            "The token endpoint refused the refresh token (" + code + ")")
                    : new ProviderException(ProviderErrorCode.REQUEST_REJECTED,
                            "The token endpoint refused the refresh (" + code + ")");
        }
        return switch (failure.getCause()) {
            case RestClientResponseException http when http.getStatusCode().is5xxServerError() ->
                new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                        "The token endpoint answered HTTP " + http.getStatusCode().value());
            case RestClientResponseException http when http.getStatusCode().value() == TOO_MANY_REQUESTS ->
                ProviderException.rateLimited("The token endpoint answered HTTP " + TOO_MANY_REQUESTS, null);
            case RestClientResponseException http -> new ProviderException(ProviderErrorCode.REQUEST_REJECTED,
                    "The token endpoint answered HTTP " + http.getStatusCode().value());
            case ResourceAccessException _ -> new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                    "The token endpoint could not be reached or did not answer in time");
            default -> new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                    "The token endpoint sent an answer Sino cannot read");
        };
    }

    // Spring's messages may quote the provider's answer; Sino names the kind of failure only.
    private static String reasonOf(OAuth2AuthorizationException failure) {
        return switch (failure.getCause()) {
            case null -> "the token endpoint refused the code (" + failure.getError().getErrorCode() + ")";
            case RestClientResponseException http -> "the token endpoint answered HTTP " + http.getStatusCode().value();
            case ResourceAccessException _ ->
                "the token endpoint could not be reached or did not answer in time";
            default -> "the token endpoint sent an answer Sino cannot read";
        };
    }

    // Names only the id: the default duplicate-key message prints both registrations, and
    // ClientRegistration.toString() prints the client secret.
    private static ClientRegistration duplicateClient(ClientRegistration first, ClientRegistration second) {
        throw new IllegalStateException("Two OAuth clients are named '" + first.getRegistrationId() + "'");
    }

    private String newState() {
        byte[] bytes = new byte[STATE_BYTES];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String checkedBaseUrl(String value) {
        IllegalStateException unusable = new IllegalStateException("SINO_PUBLIC_BASE_URL (sino.public-base-url) "
                + "must be the http(s) address the browser uses to reach Sino, for example http://localhost:5173");
        if (value == null || value.isBlank()) {
            throw unusable;
        }
        String text = value.strip();
        try {
            URI uri = new URI(text);
            boolean web = "http".equals(uri.getScheme()) || "https".equals(uri.getScheme());
            if (!web || uri.getHost() == null || uri.getRawQuery() != null || uri.getRawFragment() != null) {
                throw unusable;
            }
        } catch (URISyntaxException e) {
            throw unusable;
        }
        return text.endsWith("/") ? text.substring(0, text.length() - 1) : text;
    }

}
