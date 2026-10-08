package dev.sino.account.infrastructure.oauth;

import java.net.URI;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import dev.sino.provider.ProviderType;

/**
 * Tells a provider to drop a grant Sino will not use (RFC 7009). Best effort: a failure leaves a warning naming
 * the provider and what went wrong, never the token, and the caller carries on.
 */
@Component
public class OAuth2TokenRevoker {

    private static final Logger LOG = LoggerFactory.getLogger(OAuth2TokenRevoker.class);

    private final RestClient http;

    @Autowired
    public OAuth2TokenRevoker() {
        this(TimedRequests.CONNECT_TIMEOUT, TimedRequests.READ_TIMEOUT);
    }

    OAuth2TokenRevoker(Duration connectTimeout, Duration readTimeout) {
        this.http = RestClient.builder().requestFactory(TimedRequests.factory(connectTimeout, readTimeout)).build();
    }

    /** Does nothing when the provider has no revocation address. */
    public void revoke(ProviderType provider, URI revocationUri, String token) {
        if (revocationUri == null) {
            return;
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("token", token);
        try {
            http.post().uri(revocationUri).contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException failure) {
            LOG.warn("Revoking a {} token failed: the provider answered HTTP {}", provider,
                    failure.getStatusCode().value());
        } catch (ResourceAccessException failure) {
            LOG.warn("Revoking a {} token failed: the provider could not be reached or did not answer in time",
                    provider);
        } catch (RestClientException failure) {
            LOG.warn("Revoking a {} token failed: {}", provider, failure.getClass().getSimpleName());
        }
    }

}
