package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ProviderCredentialsTests {

    private static final String SECRET = "ya29.secret-access-token";

    @Test
    void oauth2CredentialsHideTheAccessToken() {
        OAuth2Credentials credentials = new OAuth2Credentials(SECRET, Instant.parse("2026-10-01T09:00:00Z"),
                Set.of("gmail.readonly"));

        assertThat(credentials.toString()).doesNotContain(SECRET).contains("****", "gmail.readonly");
    }

    @Test
    void tokenCredentialsHideTheToken() {
        assertThat(new TokenCredentials(SECRET).toString()).doesNotContain(SECRET).contains("****");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectAMissingSecret(String secret) {
        assertThatThrownBy(() -> new OAuth2Credentials(secret, null, Set.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TokenCredentials(secret)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theExpiryIsOptional() {
        assertThat(new OAuth2Credentials(SECRET, null, Set.of()).expiresAt()).isNull();
    }

    @Test
    void copiesTheScopes() {
        Set<String> scopes = new HashSet<>(Set.of("gmail.readonly"));
        OAuth2Credentials credentials = new OAuth2Credentials(SECRET, null, scopes);

        scopes.add("gmail.send");

        assertThat(credentials.scopes()).containsExactly("gmail.readonly");
        assertThatThrownBy(() -> credentials.scopes().add("gmail.send"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void requireTheScopes() {
        assertThatThrownBy(() -> new OAuth2Credentials(SECRET, null, null)).isInstanceOf(NullPointerException.class);
    }

}
