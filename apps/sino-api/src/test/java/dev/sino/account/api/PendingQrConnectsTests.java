package dev.sino.account.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.account.application.PendingQrConnect;

class PendingQrConnectsTests {

    private static final Instant NOW = Instant.parse("2026-10-17T08:00:00Z");
    private static final UUID OWNER = UUID.randomUUID();

    private final PendingQrConnects connects = new PendingQrConnects();

    @Test
    void findsAConnectUntilItsTenMinutesAreUp() {
        connects.add(pending("login-1", NOW));

        assertThat(connects.find("login-1", NOW.plusSeconds(599))).isPresent();
        assertThat(connects.find("login-1", NOW.plusSeconds(600))).isEmpty();
        assertThat(connects.find("login-1", NOW)).as("dropped once found expired").isEmpty();
    }

    @Test
    void findingDoesNotTakeButTakingDoes() {
        connects.add(pending("login-1", NOW));

        assertThat(connects.find("login-1", NOW)).isPresent();
        assertThat(connects.find("login-1", NOW)).isPresent();
        assertThat(connects.take("login-1")).isPresent();
        assertThat(connects.take("login-1")).isEmpty();
        assertThat(connects.find("login-1", NOW)).isEmpty();
    }

    @Test
    void keepsTheFiveNewest() {
        for (int login = 1; login <= 6; login++) {
            connects.add(pending("login-" + login, NOW));
        }

        assertThat(connects.find("login-1", NOW)).isEmpty();
        assertThat(connects.find("login-2", NOW)).isPresent();
        assertThat(connects.find("login-6", NOW)).isPresent();
    }

    @Test
    void anUnknownLoginIsNotFound() {
        assertThat(connects.find("login-9", NOW)).isEmpty();
        assertThat(connects.take("login-9")).isEmpty();
    }

    private static PendingQrConnect pending(String loginId, Instant createdAt) {
        return new PendingQrConnect("zalo", OWNER, null, null, loginId, createdAt);
    }

}
