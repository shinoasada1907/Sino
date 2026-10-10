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
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;
import dev.sino.sync.application.LiveSyncScheduler;

/**
 * Which accounts automatic sync asks for (BE-49), with the schedule itself turned off: the tests call
 * {@link LiveSyncScheduler} directly. Same configuration as {@link InitialSyncApiTests}, so the same context.
 */
@SpringBootTest(properties = { "sino.sync.rate-limit-wait=20ms", "sino.sync.rate-limit-max-wait=50ms",
    "sino.sync.unavailable-waits=10ms,10ms,10ms" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, InitialSyncApiTests.Connectors.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class AutomaticSyncTests {

    private static final Instant WEEK_AGO = Instant.now().minus(7, ChronoUnit.DAYS);

    @Autowired
    private LiveSyncScheduler scheduler;

    @Autowired
    private ApplicationContext context;

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

    // Not used here: it only makes the context the one of InitialSyncApiTests.
    @MockitoSpyBean
    private ConversationStore store;

    private UUID owner;

    @BeforeEach
    void startWithNoAccount() {
        jdbc.update("delete from sync_checkpoint");
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        connector.use(onePage().build());
    }

    @Test
    void theScheduleIsOffInTheseTests() {
        assertThat(context.containsBean("liveSyncSchedule")).as("sino.sync.live.scheduled=false").isFalse();
    }

    @Test
    void anImportedAccountIsDueOnceItsLastTryIsOlderThanTheInterval() {
        UUID triedLongAgo = checkpoint(connect(), "DONE", "1 hour", "90 seconds");
        checkpoint(connect(), "DONE", "1 hour", "30 seconds");
        UUID importedLongAgo = checkpoint(connect(), "DONE", "90 seconds", null);
        checkpoint(connect(), "DONE", "30 seconds", null);

        assertThat(scheduler.dueAccounts()).containsExactlyInAnyOrder(triedLongAgo, importedLongAgo);
    }

    @Test
    void anAccountThatDoesNotSyncOnItsOwnIsNotDue() {
        UUID connected = checkpoint(connect(), "DONE", "1 hour", "90 seconds");
        UUID paused = checkpoint(connect(), "DONE", "1 hour", "90 seconds");
        jdbc.update("update connected_account set sync_enabled = false where id = ?", paused);
        UUID disabled = checkpoint(connect(), "DONE", "1 hour", "90 seconds");
        jdbc.update("update connected_account set status = 'DISABLED' where id = ?", disabled);
        UUID expired = checkpoint(connect(), "DONE", "1 hour", "90 seconds");
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", expired);
        UUID removed = checkpoint(connect(), "DONE", "1 hour", "90 seconds");
        jdbc.update("update connected_account set removed_at = now() where id = ?", removed);

        assertThat(scheduler.dueAccounts()).containsExactly(connected);
    }

    @Test
    void anImportThatIsNotDoneIsNotDue() {
        checkpoint(connect(), "RUNNING", "1 hour", null);
        checkpoint(connect(), "FAILED", "1 hour", null);

        assertThat(scheduler.dueAccounts()).isEmpty();
    }

    @Test
    void theDueAccountsAreSynced() throws Exception {
        UUID account = imported();
        jdbc.update("update sync_checkpoint set last_success_at = now() - interval '1 hour' where account_id = ?",
                account);
        connector.use(onePage().page(message("m-2", Instant.now().minusSeconds(30))).build());

        scheduler.syncDueAccounts();

        assertThat(awaitRow(account, row -> row.get("last_sync_at") != null).get("last_sync_error")).isNull();
        assertThat(jdbc.queryForObject("select count(*) from message", Integer.class)).isEqualTo(2);
    }

    @Test
    void aSyncThatKeepsFailingWithTheSameErrorIsLoggedOnce(CapturedOutput output) throws Exception {
        UUID account = imported();
        ProviderException rejected = new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no");
        connector.use(onePage().failOnCall(1, rejected).failOnCall(2, rejected).build());

        tryAgain(account);
        awaitRow(account, row -> "REQUEST_REJECTED".equals(row.get("last_sync_error")));
        tryAgain(account);
        awaitRow(account, row -> connector.asked().size() == 2);
        // Probabilistic: a second WARN would have to come within 200 ms of the second try to be seen.
        Thread.sleep(200);

        String failed = "Sync of account " + account + " failed: REQUEST_REJECTED";
        assertThat(output.getAll().split(failed, -1)).as("logged once").hasSize(2);
        assertThat(row(account).get("last_sync_error")).isEqualTo("REQUEST_REJECTED");
    }

    @Test
    void anUnexpectedFailureThatKeepsComingIsLoggedWithItsStackOnce(CapturedOutput output) throws Exception {
        UUID account = imported();
        connector.use(new BrokenProvider());

        tryAgain(account);
        awaitRow(account, row -> "INTERNAL".equals(row.get("last_sync_error")));
        tryAgain(account);
        awaitRow(account, row -> connector.asked().size() == 2);
        Thread.sleep(200);

        assertThat(output.getAll().split("Sync of account " + account + " failed", -1)).as("logged once")
                .hasSize(2);
        assertThat(output.getAll().split("IllegalStateException: the connector broke", -1))
                .as("one stack trace").hasSize(2);
    }

    @Test
    void anAccountBeingReadIsNotDue() throws Exception {
        UUID account = imported();
        connector.use(onePage().build());
        connector.hold(1);
        tryAgain(account);
        connector.awaitHeld();
        // The pass goes on longer than the interval.
        jdbc.update("update sync_checkpoint set last_sync_attempt_at = now() - interval '1 hour' where account_id = ?",
                account);

        assertThat(scheduler.dueAccounts()).doesNotContain(account);
        connector.letGo();
        awaitRow(account, row -> row.get("last_sync_at") != null);
        assertThat(scheduler.dueAccounts()).as("the pass is timed from its end").doesNotContain(account);
    }

    @Test
    void aFailedPassIsTimedFromItsEnd() throws Exception {
        UUID account = imported();
        connector.use(onePage().failOnCall(1, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no")).build());
        connector.hold(1);
        tryAgain(account);
        connector.awaitHeld();
        jdbc.update("update sync_checkpoint set last_sync_attempt_at = now() - interval '1 hour' where account_id = ?",
                account);

        connector.letGo();
        awaitRow(account, row -> "REQUEST_REJECTED".equals(row.get("last_sync_error")));

        assertThat(scheduler.dueAccounts()).as("a pass that ran long is not followed by another at once")
                .doesNotContain(account);
    }

    // Makes the account due again and asks for the due accounts, once the worker that read it last let go of it:
    // right after a commit it may still be running listeners, and an account being read is not due.
    private void tryAgain(UUID account) throws InterruptedException {
        jdbc.update("update sync_checkpoint set last_sync_attempt_at = now() - interval '1 hour',"
                + " last_success_at = now() - interval '1 hour' where account_id = ?", account);
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (!scheduler.dueAccounts().contains(account)) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("The account " + account + " never became due");
            }
            Thread.sleep(25);
        }
        scheduler.syncDueAccounts();
    }

    private static FakeMessageProvider.Builder onePage() {
        return FakeMessageProvider.builder(ScriptedProvider.TYPE.value()).page(message("m-1", WEEK_AGO));
    }

    private UUID connect() {
        return registration.register(new RegisterAccountCommand(owner, ScriptedProvider.TYPE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null),
                new TokenCredentials("fake-sync-token-1"), null));
    }

    // A row as an import leaves it, its end and last sync try that long ago (PostgreSQL intervals; null: never).
    private UUID checkpoint(UUID account, String status, String importEnded, String lastTried) {
        jdbc.update("insert into sync_checkpoint (account_id, cursor, import_status, import_range, imported_count,"
                + " skipped_count, run_imported_count, last_started_at, last_success_at, last_sync_attempt_at,"
                + " updated_at) values (?, 'page-1@-', ?, 'ALL', 0, 0, 0, now(), now() - cast(? as interval),"
                + " now() - cast(? as interval), now())", account, status, importEnded, lastTried);
        return account;
    }

    // An account whose first import is DONE, imported through the API.
    private UUID imported() throws Exception {
        UUID account = connect();
        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"DAYS_90\"}")).andExpect(status().isAccepted());
        assertThat(awaitRow(account, row -> !"RUNNING".equals(row.get("import_status"))).get("import_status"))
                .isEqualTo("DONE");
        return account;
    }

    // Fails with an exception no provider error code covers, at every call.
    private static final class BrokenProvider implements MessageProvider {

        @Override
        public ProviderType type() {
            return ScriptedProvider.TYPE;
        }

        @Override
        public ProviderCapabilities capabilities() {
            return ProviderCapabilities.of(ProviderCapability.READ_MESSAGES);
        }

        @Override
        public AccountProfile getAccountProfile(ProviderContext context) {
            return new AccountProfile("broken", "Broken", null, null);
        }

        @Override
        public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
            throw new IllegalStateException("the connector broke");
        }

    }

    private Map<String, Object> row(UUID account) {
        return jdbc.queryForMap("select * from sync_checkpoint where account_id = ?", account);
    }

    private Map<String, Object> awaitRow(UUID account, Predicate<Map<String, Object>> done)
            throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (System.nanoTime() < deadline) {
            Map<String, Object> row = row(account);
            if (done.test(row)) {
                return row;
            }
            Thread.sleep(25);
        }
        throw new AssertionError("Waited in vain for the row of " + account);
    }

}
