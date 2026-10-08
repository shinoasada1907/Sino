package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.net.URI;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class OAuth2ConnectionTests {

    private static final URI REVOKE = URI.create("https://provider.test/revoke");

    @Test
    void keepsWhatTheConnectorDeclares() {
        OAuth2Connection connection = new OAuth2Connection("google", Set.of("openid", "email", "mail.read"),
                Set.of("mail.read"), Map.of("access_type", "offline"), REVOKE);

        assertThat(connection.registrationId()).isEqualTo("google");
        assertThat(connection.scopes()).containsExactlyInAnyOrder("openid", "email", "mail.read");
        assertThat(connection.requiredScopes()).containsExactly("mail.read");
        assertThat(connection.extraParameters()).containsExactly(Map.entry("access_type", "offline"));
        assertThat(connection.revocationUri()).isEqualTo(REVOKE);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = " ")
    void needsARegistrationId(String registrationId) {
        assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> new OAuth2Connection(registrationId, Set.of("openid"), Set.of(), Map.of(), null))
                .withMessageContaining("registrationId");
    }

    @Test
    void needsScopes() {
        assertThatNullPointerException()
                .isThrownBy(() -> new OAuth2Connection("google", null, Set.of(), Map.of(), null))
                .withMessageContaining("scopes");
        assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> new OAuth2Connection("google", Set.of(), Set.of(), Map.of(), null))
                .withMessageContaining("scopes");
    }

    @Test
    void refusesABlankScope() {
        assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> new OAuth2Connection("google", Set.of("openid", " "), Set.of(), Map.of(), null))
                .withMessageContaining("scopes");
    }

    @Test
    void needsTheRequiredScopes() {
        assertThatNullPointerException()
                .isThrownBy(() -> new OAuth2Connection("google", Set.of("openid"), null, Map.of(), null))
                .withMessageContaining("requiredScopes");
    }

    @Test
    void requiresOnlyScopesItAsksFor() {
        assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> new OAuth2Connection("google", Set.of("openid"), Set.of("mail.read"), Map.of(),
                        null))
                .withMessageContaining("requiredScopes");
    }

    @Test
    void mayRequireNoScopeAtAll() {
        assertThat(new OAuth2Connection("google", Set.of("openid"), Set.of(), Map.of(), null).requiredScopes())
                .isEmpty();
    }

    @Test
    void extraParametersAndTheRevocationAddressAreOptional() {
        OAuth2Connection connection = new OAuth2Connection("google", Set.of("openid"), Set.of(), null, null);

        assertThat(connection.extraParameters()).isEmpty();
        assertThat(connection.revocationUri()).isNull();
    }

    @Test
    void keepsItsOwnReadOnlyCopies() {
        Set<String> scopes = new HashSet<>(Set.of("openid", "mail.read"));
        Set<String> required = new HashSet<>(Set.of("mail.read"));
        Map<String, String> parameters = new HashMap<>(Map.of("prompt", "consent"));

        OAuth2Connection connection = new OAuth2Connection("google", scopes, required, parameters, null);
        scopes.add("email");
        required.add("openid");
        parameters.put("access_type", "offline");

        assertThat(connection.scopes()).containsExactlyInAnyOrder("openid", "mail.read");
        assertThat(connection.requiredScopes()).containsExactly("mail.read");
        assertThat(connection.extraParameters()).containsExactly(Map.entry("prompt", "consent"));
        assertThatExceptionOfType(UnsupportedOperationException.class)
                .isThrownBy(() -> connection.scopes().add("email"));
        assertThatExceptionOfType(UnsupportedOperationException.class)
                .isThrownBy(() -> connection.requiredScopes().add("openid"));
        assertThatExceptionOfType(UnsupportedOperationException.class)
                .isThrownBy(() -> connection.extraParameters().put("access_type", "offline"));
    }

}
