package dev.sino.account.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import dev.sino.account.application.PendingConnect;

/**
 * The connects a browser session has started: each one is used once, lasts ten minutes, and a session keeps at
 * most five.
 */
class PendingConnectsTests {

    private static final Instant START = Instant.parse("2026-10-07T10:00:00Z");

    private final PendingConnects pending = new PendingConnects();

    @Test
    void aConnectIsTakenOnlyOnce() {
        pending.add(connect("state-1", START));

        assertThat(pending.take("state-1", START.plusSeconds(5))).get()
                .extracting(PendingConnect::state).isEqualTo("state-1");
        assertThat(pending.take("state-1", START.plusSeconds(6))).isEmpty();
    }

    @Test
    void anotherStateFindsNothingAndTakesNothing() {
        pending.add(connect("state-1", START));

        assertThat(pending.take("state-2", START)).isEmpty();
        assertThat(pending.take(null, START)).isEmpty();
        assertThat(pending.take("state-1", START)).isPresent();
    }

    @Test
    void aConnectLastsTenMinutes() {
        pending.add(connect("state-1", START));
        pending.add(connect("state-2", START));

        assertThat(pending.take("state-1", START.plus(Duration.ofMinutes(10)).minusSeconds(1))).isPresent();
        assertThat(pending.take("state-2", START.plus(Duration.ofMinutes(10)))).isEmpty();
    }

    @Test
    void keepsTheFiveNewestConnects() {
        for (int i = 1; i <= 6; i++) {
            pending.add(connect("state-" + i, START.plusSeconds(i)));
        }

        assertThat(pending.take("state-1", START.plusSeconds(10))).isEmpty();
        for (int i = 2; i <= 6; i++) {
            assertThat(pending.take("state-" + i, START.plusSeconds(10))).as("state-" + i).isPresent();
        }
    }

    @Test
    void anExpiredConnectMakesRoomInsteadOfANewerOne() {
        pending.add(connect("old", START));
        Instant later = START.plus(Duration.ofMinutes(11));
        for (int i = 1; i <= 5; i++) {
            pending.add(connect("state-" + i, later));
        }

        for (int i = 1; i <= 5; i++) {
            assertThat(pending.take("state-" + i, later)).as("state-" + i).isPresent();
        }
    }

    @Test
    void survivesBeingWrittenOutWithTheSession() throws Exception {
        pending.add(connect("state-1", START));

        PendingConnects copy = roundTrip(pending);

        assertThat(copy.take("state-1", START)).get()
                .extracting(PendingConnect::authorizationUrl).asString().contains("state=state-1");
    }

    private static PendingConnect connect(String state, Instant createdAt) {
        OAuth2AuthorizationRequest request = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri("https://provider.test/authorize")
                .clientId("client-1")
                .redirectUri("http://localhost:5173/api/accounts/connect/gmail/callback")
                .state(state)
                .build();
        return new PendingConnect("gmail", UUID.randomUUID(), null, null, request, createdAt);
    }

    private static PendingConnects roundTrip(PendingConnects original) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(original);
        }
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            return (PendingConnects) in.readObject();
        }
    }

}
