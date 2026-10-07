package dev.sino.provider.spi;

import java.net.URI;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * How a connector is connected over OAuth2 (D-38): the OAuth client of Sino it uses, the scopes it needs, extra
 * parameters for the consent request, and where to revoke a token ({@code null} when the provider has no such
 * address). It holds no client secret and no token: the {@code account} module exchanges codes and refreshes
 * tokens with the client registered under {@code registrationId} (D-15 = A').
 */
public record OAuth2Connection(String registrationId, Set<String> scopes, Map<String, String> extraParameters,
        URI revocationUri) {

    public OAuth2Connection {
        if (registrationId == null || registrationId.isBlank()) {
            throw new IllegalArgumentException("registrationId must not be blank");
        }
        Objects.requireNonNull(scopes, "scopes must not be null");
        if (scopes.isEmpty() || scopes.stream().anyMatch(String::isBlank)) {
            throw new IllegalArgumentException("scopes must not be empty or contain a blank scope");
        }
        scopes = Set.copyOf(scopes);
        extraParameters = extraParameters == null ? Map.of() : Map.copyOf(extraParameters);
    }

}
