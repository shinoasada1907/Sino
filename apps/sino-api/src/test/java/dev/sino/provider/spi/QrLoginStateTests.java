package dev.sino.provider.spi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class QrLoginStateTests {

    private static final String SESSION = "{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"zpw-done-cookie\"}], "
            + "\"imei\": \"imei-done\", \"userAgent\": \"Mozilla/5.0\"}";
    private static final AccountProfile PROFILE = new AccountProfile("100000000000000001", "Lan", null, null);

    // A finished login carries the account's credential: printing it, as a log line would, never shows it.
    @Test
    void aFinishedLoginNeverPrintsItsCredential() {
        QrLoginState done = new QrLoginState.Done(PROFILE, new TokenCredentials(SESSION));

        assertThat(done.toString()).contains("100000000000000001").doesNotContain("zpw-done-cookie")
                .doesNotContain("imei-done");
    }

    @Test
    void aFinishedLoginNeedsTheAccountAndItsCredential() {
        assertThatThrownBy(() -> new QrLoginState.Done(null, new TokenCredentials(SESSION)))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new QrLoginState.Done(PROFILE, null)).isInstanceOf(NullPointerException.class);
    }

    // Built from what the provider sent: a part missing is a broken answer, like a profile without a name.
    @Test
    void aChallengeNeedsItsLoginAndItsImage() {
        Instant expiresAt = Instant.parse("2026-10-17T08:01:40Z");

        assertThatThrownBy(() -> new QrChallenge(" ", "iVBORw0KGgo=", expiresAt))
                .isInstanceOf(ProviderException.class);
        assertThatThrownBy(() -> new QrChallenge("login-1", "", expiresAt))
                .isInstanceOf(ProviderException.class);
        assertThatThrownBy(() -> new QrChallenge("login-1", "iVBORw0KGgo=", null))
                .isInstanceOf(NullPointerException.class);
    }

    // The image is a few kilobytes of base64: a log line keeps the login and its end, not the picture.
    @Test
    void aChallengePrintsWithoutItsImage() {
        QrChallenge challenge = new QrChallenge("login-1", "iVBORw0KGgoAAAANSUhEUgAAAAE",
                Instant.parse("2026-10-17T08:01:40Z"));

        assertThat(challenge.toString()).contains("login-1").contains("2026-10-17T08:01:40Z")
                .doesNotContain("iVBORw0KGgoAAAANSUhEUgAAAAE");
    }

}
