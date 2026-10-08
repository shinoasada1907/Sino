package dev.sino.provider.infrastructure.gmail;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * The Gmail connector. For now it knows who the account is and how it connects; reading mail
 * ({@code READ_MESSAGES}) comes with F04b. Every call to Google has a time limit, so a hanging Google cannot hold
 * a request thread.
 */
class GmailProvider implements MessageProvider {

    static final ProviderType TYPE = ProviderType.of("gmail");
    static final String REGISTRATION_ID = "google";
    static final String GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
    static final Set<String> SCOPES = Set.of("openid", "email", GMAIL_READONLY);
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(10);

    // Google issues a refresh token only for offline access, and only on a fresh consent: a reconnect must ask again.
    private static final Map<String, String> CONSENT_PARAMETERS = Map.of("access_type", "offline",
            "prompt", "consent");
    private static final ParameterizedTypeReference<Map<String, Object>> JSON_OBJECT =
            new ParameterizedTypeReference<>() {
            };

    private final URI userInfoUri;
    private final OAuth2Connection connection;
    private final RestClient google;

    GmailProvider(GmailProperties properties) {
        this(properties.userInfoUri(), properties.revocationUri(), CONNECT_TIMEOUT, READ_TIMEOUT);
    }

    GmailProvider(URI userInfoUri, URI revocationUri, Duration connectTimeout, Duration readTimeout) {
        this.userInfoUri = userInfoUri;
        this.connection = new OAuth2Connection(REGISTRATION_ID, SCOPES, Set.of(GMAIL_READONLY), CONSENT_PARAMETERS,
                revocationUri);
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(connectTimeout).build());
        requestFactory.setReadTimeout(readTimeout);
        this.google = RestClient.builder().requestFactory(requestFactory).build();
    }

    @Override
    public ProviderType type() {
        return TYPE;
    }

    @Override
    public String displayName() {
        return "Gmail";
    }

    @Override
    public ProviderCapabilities capabilities() {
        return ProviderCapabilities.of();
    }

    @Override
    public Optional<OAuth2Connection> oauth2() {
        return Optional.of(connection);
    }

    /** The Google subject ({@code sub}) never changes, unlike the email, so it identifies the account. */
    @Override
    public AccountProfile getAccountProfile(ProviderContext context) {
        String accessToken = accessTokenOf(context);
        Map<String, Object> userInfo = call(() -> google.get()
                .uri(userInfoUri)
                .headers(headers -> headers.setBearerAuth(accessToken))
                .retrieve()
                .body(JSON_OBJECT));
        return new AccountProfile(text(userInfo, "sub"), text(userInfo, "email"), null);
    }

    @Override
    public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
        throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                TYPE + " does not support " + ProviderCapability.READ_MESSAGES + " yet");
    }

    private static String accessTokenOf(ProviderContext context) {
        if (context.credentials() instanceof OAuth2Credentials oauth2) {
            return oauth2.accessToken();
        }
        throw new IllegalArgumentException("Gmail needs OAuth2 credentials");
    }

    private static String text(Map<String, Object> json, String name) {
        return json != null && json.get(name) instanceof String value ? value : null;
    }

    // Messages name the failure only: never the token, never what Google sent back.
    private static <T> T call(Supplier<T> request) {
        try {
            return request.get();
        } catch (RestClientResponseException failure) {
            throw failureFor(failure.getStatusCode(), failure.getResponseHeaders());
        } catch (ResourceAccessException failure) {
            throw new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                    "Google could not be reached or did not answer in time");
        } catch (RestClientException failure) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "Google sent an answer Sino cannot read");
        }
    }

    private static ProviderException failureFor(HttpStatusCode status, HttpHeaders headers) {
        int code = status.value();
        if (code == 401) {
            return new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "Google refused the access token (401)");
        }
        if (code == 429) {
            return ProviderException.rateLimited("Google is throttling Sino (429)", retryAfter(headers));
        }
        if (status.is5xxServerError()) {
            return new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "Google answered " + code);
        }
        return new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "Google refused the request (" + code + ")");
    }

    // Only the delay-seconds form of Retry-After; a date or anything else means "not said".
    private static Duration retryAfter(HttpHeaders headers) {
        String value = headers == null ? null : headers.getFirst(HttpHeaders.RETRY_AFTER);
        if (value == null || !value.strip().matches("\\d{1,9}")) {
            return null;
        }
        long seconds = Long.parseLong(value.strip());
        return seconds > 0 ? Duration.ofSeconds(seconds) : null;
    }

}
