package dev.sino.account.infrastructure.oauth;

import java.net.URI;
import java.net.URISyntaxException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestCustomizers;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.stereotype.Component;

import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;

/**
 * Sino's OAuth2 clients (D-38): finds the client a connector names and builds the consent request with a fresh
 * state, PKCE and the redirect URI of the connect flow. Checked at startup: every OAuth2 connector needs its client
 * and a public base URL, so a wrong setup stops the app instead of failing at the first connect.
 */
@Component
public class OAuth2Clients {

    static final String CALLBACK_PATH = "/api/accounts/connect/%s/callback";
    private static final int STATE_BYTES = 32;

    private final Map<String, ClientRegistration> registrations;
    private final String publicBaseUrl;
    private final SecureRandom random = new SecureRandom();

    // With a single constructor Spring passes an empty list when there is no client registration.
    public OAuth2Clients(List<MessageProvider> providers, List<ClientRegistration> registrations,
            ConnectProperties properties) {
        this.registrations = registrations.stream()
                .collect(Collectors.toMap(ClientRegistration::getRegistrationId, Function.identity()));
        List<MessageProvider> oauth2Connectors = providers.stream().filter(p -> p.oauth2().isPresent()).toList();
        for (MessageProvider connector : oauth2Connectors) {
            String registrationId = connector.oauth2().orElseThrow().registrationId();
            if (!this.registrations.containsKey(registrationId)) {
                throw new IllegalStateException("Connector '" + connector.type() + "' connects with the OAuth client '"
                        + registrationId + "', which is not configured");
            }
        }
        this.publicBaseUrl = oauth2Connectors.isEmpty() ? null : checkedBaseUrl(properties.publicBaseUrl());
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
