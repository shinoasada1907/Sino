package dev.sino.account.infrastructure.oauth;

import java.net.URI;
import java.time.Duration;
import java.util.UUID;

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

    /**
     * Does nothing when the provider has no revocation address. {@code accountId} names the account in the log, or
     * is {@code null} when the grant belongs to no account yet (a connect that did not finish).
     */
    public void revoke(ProviderType provider, UUID accountId, URI revocationUri, String token) {
        if (revocationUri == null) {
            return;
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("token", token);
        String grant = accountId == null ? "a " + provider + " grant"
                : "the " + provider + " grant of account " + accountId;
        try {
            http.post().uri(revocationUri).contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException failure) {
            LOG.warn("Revoking {} failed: the provider answered HTTP {}", grant, failure.getStatusCode().value());
        } catch (ResourceAccessException failure) {
            LOG.warn("Revoking {} failed: the provider could not be reached or did not answer in time", grant);
        } catch (RestClientException failure) {
            LOG.warn("Revoking {} failed: {}", grant, failure.getClass().getSimpleName());
        }
    }

}
