package dev.sino.sync;

import static dev.sino.provider.FakeMessageProvider.message;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
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
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderKind;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.PushRegistration;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;
import dev.sino.sync.application.LiveSyncScheduler;
import dev.sino.sync.application.PushWatches;

/**
 * Keeping the provider telling Sino of changes (BE-51, D-76): a watch once the import is done, renewed before it
 * ends, failures recorded, and the minute poll slowed to five while a watch is on. The schedule is off: the tests call
 * {@link PushWatches} and {@link LiveSyncScheduler} directly. Same configuration as {@link InitialSyncApiTests}, so
 * the same context.
 */
@SpringBootTest(properties = { "sino.sync.rate-limit-wait=20ms", "sino.sync.rate-limit-max-wait=50ms",
    "sino.sync.unavailable-waits=10ms,10ms,10ms" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, InitialSyncApiTests.Connectors.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
@RecordApplicationEvents
class PushWatchTests {

    private static final Instant WEEK_AGO = Instant.now().minus(7, ChronoUnit.DAYS);
    private static final Instant IN_A_WEEK = Instant.now().plus(7, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
    private static final String MAILBOX = "Fake.Owner@fake.test";

    @Autowired
    private PushWatches watches;

    @Autowired
    private LiveSyncScheduler scheduler;

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
    private ApplicationEvents events;

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
    void anAccountIsWatchedOnceItsImportIsDone() throws Exception {
        connector.use(onePage().push(MAILBOX, IN_A_WEEK).build());

        UUID account = imported();

        Map<String, Object> row = awaitRow(account, done -> done.get("watch_expires_at") != null);
        assertThat(row.get("watch_address")).isEqualTo(MAILBOX);
        assertThat(instant(row.get("watch_expires_at"))).isEqualTo(IN_A_WEEK);
        assertThat(row.get("watch_error")).isNull();
        assertThat(connector.pushCalls()).isEqualTo(1);
        syncStatus(account).andExpect(jsonPath("$.push").value("ACTIVE"))
                .andExpect(jsonPath("$.pushExpiresAt").value(IN_A_WEEK.toString()));

        mvc.perform(post("/api/accounts/{id}/sync", account).with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isAccepted());
        awaitRow(account, done -> done.get("last_sync_at") != null);
        awaitIdle(account);
        assertThat(connector.pushCalls()).as("a sync leaves the watch to the hourly check").isEqualTo(1);
    }

    // The failed run and the next one read the account one after the other: once the second is done and the account
    // is no longer read, every registration has been counted.
    @Test
    void aFailedImportIsNotWatched() throws Exception {
        connector.use(onePage().push(MAILBOX, IN_A_WEEK)
                .failOnCall(1, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no")).build());
        UUID account = connect();
        startImport(account);
        assertThat(awaitRow(account, row -> !"RUNNING".equals(row.get("import_status"))).get("import_status"))
                .isEqualTo("FAILED");

        startImport(account);
        awaitRow(account, row -> "DONE".equals(row.get("import_status")) && row.get("watch_expires_at") != null);
        awaitIdle(account);

        assertThat(connector.pushCalls()).as("only after the import that read every page").isEqualTo(1);
    }

    @Test
    void aRegistrationThatFailsAfterTheImportLeavesTheImportDone() throws Exception {
        connector.use(onePage().pushFailure(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no topic"))
                .build());

        UUID account = imported();

        Map<String, Object> row = awaitRow(account, done -> done.get("watch_error") != null);
        assertThat(row.get("watch_error")).isEqualTo("REQUEST_REJECTED");
        assertThat(row.get("import_status")).isEqualTo("DONE");
        assertThat(row.get("last_error_code")).isNull();
        syncStatus(account).andExpect(jsonPath("$.importDone").value(true))
                .andExpect(jsonPath("$.push").value("FAILED"));
    }

    // The worker that just imported the account registers it while the hourly check finds it due.
    @Test
    void aRegistrationUnderWayIsNotStartedTwice() throws Exception {
        connector.use(onePage().push(MAILBOX, IN_A_WEEK).build());
        connector.holdPush();
        UUID account = imported();
        connector.awaitHeld();

        watches.renewDueWatches();

        assertThat(connector.pushCalls()).isEqualTo(1);
        connector.letGo();
        assertThat(expiresAtOnceWatched(account)).isEqualTo(IN_A_WEEK);
        awaitIdle(account);
        assertThat(connector.pushCalls()).isEqualTo(1);
    }

    @Test
    void aRegistrationStoppedByTheClosingApplicationRecordsNothing(CapturedOutput output) throws Exception {
        connector.use(onePage().push(MAILBOX, IN_A_WEEK).build());
        connector.holdPush();
        UUID account = imported();
        connector.awaitHeld();

        connector.interruptHeld();
        awaitIdle(account);

        assertThat(row(account).get("watch_error")).isNull();
        assertThat(row(account).get("watch_expires_at")).isNull();
        assertThat(output.getAll()).doesNotContain("could not be registered");
    }

    @Test
    void aConnectorWithPushThatRegistersNothingIsFailed() throws Exception {
        connector.use(onePage().capabilities(ProviderCapability.READ_MESSAGES, ProviderCapability.PUSH_WEBHOOK)
                .build());
        UUID account = checkpoint(connect(), null, "30 seconds");

        watches.renewDueWatches();

        assertThat(connector.pushCalls()).isEqualTo(1);
        assertThat(row(account).get("watch_error")).isEqualTo("PUSH_NOT_REGISTERED");
        syncStatus(account).andExpect(jsonPath("$.push").value("FAILED"));
    }

    @Test
    void anAccountWhoseConnectorCannotPushIsNeverWatched() throws Exception {
        UUID account = imported();
        awaitIdle(account);

        watches.renewDueWatches();

        assertThat(connector.pushCalls()).as("the connector is not even asked").isZero();
        assertThat(row(account).get("watch_address")).isNull();
        syncStatus(account).andExpect(jsonPath("$.push").value("OFF"))
                .andExpect(jsonPath("$.pushExpiresAt").value(nullValue()));
    }

    @Test
    void aWatchThatEndsWithinTwoDaysIsRenewedAndOneThatLastsIsNot() throws Exception {
        connector.use(onePage().push(MAILBOX, IN_A_WEEK).build());
        UUID endsTomorrow = checkpoint(connect(), "1 day", "30 seconds");
        UUID endsInFiveDays = checkpoint(connect(), "5 days", "30 seconds");
        UUID ended = checkpoint(connect(), "-1 hour", "30 seconds");
        UUID neverWatched = checkpoint(connect(), null, "30 seconds");
        Instant fiveDaysAway = expiresAt(endsInFiveDays);

        watches.renewDueWatches();

        assertThat(connector.pushCalls()).isEqualTo(3);
        assertThat(expiresAt(endsTomorrow)).isEqualTo(IN_A_WEEK);
        assertThat(expiresAt(ended)).isEqualTo(IN_A_WEEK);
        assertThat(expiresAt(neverWatched)).isEqualTo(IN_A_WEEK);
        assertThat(expiresAt(endsInFiveDays)).isEqualTo(fiveDaysAway);
        assertThat(row(neverWatched).get("watch_address")).isEqualTo(MAILBOX);
        assertThat(events.stream(SyncStateChanged.class).map(SyncStateChanged::accountId))
                .as("the web reads the status again").containsExactlyInAnyOrder(endsTomorrow, ended, neverWatched);
    }

    @Test
    void anAccountWithAWatchOnIsPolledEveryFiveMinutes() throws Exception {
        UUID watchedTriedTwoMinutesAgo = checkpoint(connect(), "3 days", "2 minutes");
        UUID watchedTriedSixMinutesAgo = checkpoint(connect(), "3 days", "6 minutes");
        UUID endedTriedTwoMinutesAgo = checkpoint(connect(), "-1 minute", "2 minutes");
        UUID unwatchedTriedTwoMinutesAgo = checkpoint(connect(), null, "2 minutes");
        UUID unwatchedTriedThirtySecondsAgo = checkpoint(connect(), null, "30 seconds");

        assertThat(scheduler.dueAccounts()).containsExactlyInAnyOrder(watchedTriedSixMinutesAgo,
                endedTriedTwoMinutesAgo, unwatchedTriedTwoMinutesAgo).doesNotContain(watchedTriedTwoMinutesAgo,
                        unwatchedTriedThirtySecondsAgo);
        syncStatus(endedTriedTwoMinutesAgo).andExpect(jsonPath("$.push").value("OFF"))
                .andExpect(jsonPath("$.pushExpiresAt").value(nullValue()));
    }

    @Test
    void aWatchTheProviderRefusesIsFailedAndTheAccountIsPolledEveryMinuteAgain(CapturedOutput output)
            throws Exception {
        connector.use(onePage().pushFailure(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no topic"))
                .build());
        UUID account = checkpoint(connect(), "1 day", "2 minutes");
        assertThat(scheduler.dueAccounts()).as("its watch is still on").doesNotContain(account);

        watches.renewDueWatches();

        assertThat(row(account).get("watch_error")).isEqualTo("REQUEST_REJECTED");
        syncStatus(account).andExpect(jsonPath("$.push").value("FAILED"))
                .andExpect(jsonPath("$.pushExpiresAt").value(nullValue()));
        assertThat(scheduler.dueAccounts()).as("a failed watch may not bring the changes").contains(account);
        assertThat(events.stream(SyncStateChanged.class)).hasSize(1);
        assertThat(output).contains("The watch of account " + account + " could not be registered: REQUEST_REJECTED");
    }

    @Test
    void aFailureThatComesAgainIsLoggedOnceAndTheNextSuccessClearsIt(CapturedOutput output) throws Exception {
        connector.use(onePage().pushFailure(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no topic"))
                .build());
        UUID account = checkpoint(connect(), "5 days", "30 seconds");
        jdbc.update("update sync_checkpoint set watch_error = 'REQUEST_REJECTED' where account_id = ?", account);

        watches.renewDueWatches();

        assertThat(connector.pushCalls()).as("a failed watch is tried again at every check").isEqualTo(1);
        assertThat(output.getAll()).doesNotContain("could not be registered");
        assertThat(events.stream(SyncStateChanged.class)).as("nothing changed").isEmpty();

        connector.use(onePage().push(MAILBOX, IN_A_WEEK).build());
        watches.renewDueWatches();

        assertThat(row(account).get("watch_error")).isNull();
        assertThat(expiresAt(account)).isEqualTo(IN_A_WEEK);
        syncStatus(account).andExpect(jsonPath("$.push").value("ACTIVE"));
    }

    @Test
    void anUnexpectedFailureIsRecordedWithItsStackLoggedOnce(CapturedOutput output) throws Exception {
        connector.use(new BrokenProvider());
        UUID account = checkpoint(connect(), null, "30 seconds");

        watches.renewDueWatches();
        watches.renewDueWatches();

        assertThat(connector.pushCalls()).isEqualTo(2);
        assertThat(row(account).get("watch_error")).isEqualTo("INTERNAL");
        assertThat(output.getAll().split("IllegalStateException: the watch broke", -1)).as("one stack trace")
                .hasSize(2);
    }

    @Test
    void anAccountThatDoesNotSyncOnItsOwnOrIsNotImportedIsNotWatched() throws Exception {
        connector.use(onePage().push(MAILBOX, IN_A_WEEK).build());
        UUID paused = checkpoint(connect(), null, "30 seconds");
        jdbc.update("update connected_account set sync_enabled = false where id = ?", paused);
        UUID disabled = checkpoint(connect(), null, "30 seconds");
        jdbc.update("update connected_account set status = 'DISABLED' where id = ?", disabled);
        UUID expired = checkpoint(connect(), null, "30 seconds");
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", expired);
        UUID removed = checkpoint(connect(), null, "30 seconds");
        jdbc.update("update connected_account set removed_at = now() where id = ?", removed);
        UUID importing = checkpoint(connect(), null, "30 seconds");
        jdbc.update("update sync_checkpoint set import_status = 'RUNNING' where account_id = ?", importing);
        UUID importFailed = checkpoint(connect(), null, "30 seconds");
        jdbc.update("update sync_checkpoint set import_status = 'FAILED' where account_id = ?", importFailed);

        watches.renewDueWatches();

        assertThat(connector.pushCalls()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from sync_checkpoint where watch_address is not null",
                Integer.class)).isZero();
    }

    private ResultActions syncStatus(UUID account) throws Exception {
        return mvc.perform(get("/api/accounts/{id}/sync", account).with(user("owner@sino.test")))
                .andExpect(status().isOk());
    }

    // Waits until no worker reads the account any more: only then is it due.
    private void awaitIdle(UUID account) throws InterruptedException {
        jdbc.update("update sync_checkpoint set last_sync_attempt_at = now() - interval '1 hour',"
                + " last_success_at = now() - interval '1 hour' where account_id = ?", account);
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (!scheduler.dueAccounts().contains(account)) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("The account " + account + " is still being read");
            }
            Thread.sleep(25);
        }
    }

    private static FakeMessageProvider.Builder onePage() {
        return FakeMessageProvider.builder(ScriptedProvider.TYPE.value()).page(message("m-1", WEEK_AGO));
    }

    private UUID connect() {
        return registration.register(new RegisterAccountCommand(owner, ScriptedProvider.TYPE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null),
                new TokenCredentials("fake-sync-token-1"), null));
    }

    // A DONE row whose watch ends that far from now and whose last sync was tried that long ago (PostgreSQL
    // intervals; a null watch: never watched).
    private UUID checkpoint(UUID account, String watchEndsIn, String lastTried) {
        jdbc.update("insert into sync_checkpoint (account_id, cursor, import_status, import_range, imported_count,"
                + " skipped_count, run_imported_count, last_started_at, last_success_at, last_sync_attempt_at,"
                + " watch_address, watch_expires_at, updated_at) values (?, 'page-1@-', 'DONE', 'ALL', 0, 0, 0,"
                + " now(), now() - interval '1 hour', now() - cast(? as interval),"
                + " case when cast(? as text) is null then null else 'old@fake.test' end,"
                + " now() + cast(? as interval), now())",
                account, lastTried, watchEndsIn, watchEndsIn);
        return account;
    }

    // An account whose first import is DONE, imported through the API.
    private UUID imported() throws Exception {
        UUID account = connect();
        startImport(account);
        assertThat(awaitRow(account, row -> !"RUNNING".equals(row.get("import_status"))).get("import_status"))
                .isEqualTo("DONE");
        return account;
    }

    private void startImport(UUID account) throws Exception {
        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"DAYS_90\"}")).andExpect(status().isAccepted());
    }

    private Instant expiresAt(UUID account) {
        return instant(row(account).get("watch_expires_at"));
    }

    private Instant expiresAtOnceWatched(UUID account) throws InterruptedException {
        return instant(awaitRow(account, row -> row.get("watch_expires_at") != null).get("watch_expires_at"));
    }

    private static Instant instant(Object value) {
        return Optional.ofNullable((Timestamp) value).map(Timestamp::toInstant).orElse(null);
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

    // Declares push, and fails with an exception no provider error code covers when asked to register.
    private static final class BrokenProvider implements MessageProvider {

        @Override
        public ProviderType type() {
            return ScriptedProvider.TYPE;
        }

        @Override
        public ProviderKind kind() {
            return ProviderKind.EMAIL;
        }

        @Override
        public ProviderCapabilities capabilities() {
            return ProviderCapabilities.of(ProviderCapability.READ_MESSAGES, ProviderCapability.PUSH_WEBHOOK);
        }

        @Override
        public AccountProfile getAccountProfile(ProviderContext context) {
            return new AccountProfile("broken", "Broken", null, null);
        }

        @Override
        public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
            throw new IllegalStateException("not read in these tests");
        }

        @Override
        public Optional<PushRegistration> registerPush(ProviderContext context) {
            throw new IllegalStateException("the watch broke");
        }

    }

}
