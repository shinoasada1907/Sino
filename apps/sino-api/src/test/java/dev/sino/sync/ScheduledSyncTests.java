package dev.sino.sync;

import static dev.sino.provider.FakeMessageProvider.message;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.TokenCredentials;

/**
 * The schedule of automatic sync really runs (BE-49): the one test with {@code sino.sync.live.scheduled} on, at a
 * fast pace. Its own application context, since the others turn the schedule off, closed afterwards so it does not
 * keep ticking through the rest of the tests.
 */
@SpringBootTest(properties = { "sino.sync.live.scheduled=true", "sino.sync.live.tick=PT0.2S",
    "sino.sync.live.poll-interval=PT0.5S" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, InitialSyncApiTests.Connectors.class })
@ActiveProfiles("test")
@DirtiesContext
class ScheduledSyncTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ScriptedProvider connector;

    @Autowired
    private ApplicationContext context;

    @Test
    void anImportedAccountIsSyncedWithoutAnyoneAsking() throws Exception {
        assertThat(context.containsBean("liveSyncSchedule")).isTrue();
        connector.use(FakeMessageProvider.builder(ScriptedProvider.TYPE.value())
                .page(message("m-1", Instant.now().minusSeconds(60))).build());
        UUID owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        UUID account = registration.register(new RegisterAccountCommand(owner, ScriptedProvider.TYPE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null),
                new TokenCredentials("fake-sync-token-1"), null));

        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"DAYS_30\"}")).andExpect(status().isAccepted());

        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        Object syncedAt = null;
        while (syncedAt == null && System.nanoTime() < deadline) {
            syncedAt = jdbc.queryForObject("select last_sync_at from sync_checkpoint where account_id = ?",
                    Object.class, account);
            Thread.sleep(50);
        }
        assertThat(syncedAt).as("synced by the schedule, with no request").isNotNull();
    }

}
