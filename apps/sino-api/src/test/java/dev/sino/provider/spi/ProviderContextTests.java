package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class ProviderContextTests {

    private static final UUID ACCOUNT_ID = UUID.fromString("7f1d6a52-3c1e-4f7b-9a0e-2b8c4d5e6f70");
    private static final String SECRET = "ya29.secret-access-token";

    @Test
    void neverPrintsTheOAuth2Token() {
        ProviderContext context = new ProviderContext(ACCOUNT_ID, "alice@example.com",
                new OAuth2Credentials(SECRET, null, Set.of("gmail.readonly")));

        assertThat(context.toString()).doesNotContain(SECRET).contains(ACCOUNT_ID.toString(), "****");
    }

    @Test
    void neverPrintsTheToken() {
        ProviderContext context = new ProviderContext(ACCOUNT_ID, null, new TokenCredentials(SECRET));

        assertThat(context.toString()).doesNotContain(SECRET).contains("****");
    }

    @Test
    void neverLeaksTheTokenThroughAnExceptionMessage() {
        ProviderContext context = new ProviderContext(ACCOUNT_ID, null, new TokenCredentials(SECRET));

        assertThat(new IllegalStateException("sync failed for " + context).getMessage()).doesNotContain(SECRET);
    }

    @Test
    void theExternalAccountIdIsUnknownBeforeTheProfile() {
        ProviderContext context = new ProviderContext(ACCOUNT_ID, null, new TokenCredentials(SECRET));

        assertThat(context.externalAccountId()).isNull();
    }

    @Test
    void requiresAnAccountAndCredentials() {
        assertThatThrownBy(() -> new ProviderContext(null, null, new TokenCredentials(SECRET)))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new ProviderContext(ACCOUNT_ID, null, null))
                .isInstanceOf(NullPointerException.class);
    }

}
