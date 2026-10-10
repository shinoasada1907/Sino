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
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUser;
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

/**
 * Keeping an account up to date after its first import (BE-48), through HTTP on the whole application and a real
 * PostgreSQL, with the scripted connector of the import tests. The same configuration as {@link InitialSyncApiTests},
 * spy included, so both share one application context.
 */
@SpringBootTest(properties = { "sino.sync.rate-limit-wait=20ms", "sino.sync.rate-limit-max-wait=50ms",
    "sino.sync.unavailable-waits=10ms,10ms,10ms" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, InitialSyncApiTests.Connectors.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class LiveSyncApiTests {

    private static final String TOKEN = "fake-sync-token-1";
    private static final Instant NOW = Instant.now();
    private static final Instant WEEK_AGO = NOW.minus(7, ChronoUnit.DAYS);

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
    private UUID otherUser;

    @BeforeEach
    void startWithNoImport() {
        jdbc.update("delete from sync_checkpoint");
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        otherUser = users.save(new AppUser("other@example.com", "Other")).id();
        connector.use(twoPages().build());
    }

    @Test
    void newMailAfterTheImportIsStoredFromTheSavedCursor() throws Exception {
        UUID account = imported(owner);
        String cursorAfterImport = cursorOf(account);
        connector.use(twoPages().page(message("m-5", NOW.minusSeconds(30))).build());

        syncNow(account).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.importDone").value(true));
        awaitSync(account);

        assertThat(connector.asked()).first().isEqualTo(new SyncCursor(cursorAfterImport));
        assertThat(messages(account)).containsExactlyInAnyOrder("m-1", "m-2", "m-3", "m-4", "m-5");
        assertThat(cursorOf(account)).isNotEqualTo(cursorAfterImport);
        Map<String, Object> row = row(account);
        assertThat(row.get("import_status")).isEqualTo("DONE");
        assertThat(row.get("imported_count")).as("the import's own count stays").isEqualTo(4);
        assertThat(row.get("last_sync_at")).isNotNull();
        assertThat(row.get("last_sync_error")).isNull();
        mvc.perform(get("/api/accounts/{id}/sync", account).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.importDone").value(true))
                .andExpect(jsonPath("$.lastSyncAt").isNotEmpty())
                .andExpect(jsonPath("$.lastError").value(nullValue()))
                .andExpect(jsonPath("$.push").value("OFF"))
                .andExpect(jsonPath("$.pushExpiresAt").value(nullValue()));
    }

    @Test
    void aFailedSyncIsRecordedWithoutFailingTheImportAndTheNextOneClearsIt() throws Exception {
        UUID account = imported(owner);
        connector.use(twoPages().failOnCall(1, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"))
                .build());

        syncNow(account).andExpect(status().isAccepted());
        Map<String, Object> failed = awaitAttempt(account);

        assertThat(failed.get("last_sync_error")).isEqualTo("REQUEST_REJECTED");
        assertThat(failed.get("last_sync_attempt_at")).as("the next try is timed from it (BE-49)").isNotNull();
        assertThat(failed.get("last_sync_at")).isNull();
        assertThat(failed.get("import_status")).isEqualTo("DONE");
        assertThat(failed.get("last_error_code")).as("the import's own error").isNull();
        mvc.perform(get("/api/accounts/{id}/sync", account).with(apiUser()))
                .andExpect(jsonPath("$.lastError").value("REQUEST_REJECTED"));

        connector.use(twoPages().build());
        syncNow(account).andExpect(status().isAccepted());
        awaitSync(account);

        assertThat(row(account).get("last_sync_error")).isNull();
    }

    @Test
    void aProviderThatStaysUnreachableIsRecordedAfterTheRetries() throws Exception {
        UUID account = imported(owner);
        ProviderException down = new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "down");
        connector.use(twoPages().failOnCall(1, down).failOnCall(2, down).failOnCall(3, down).failOnCall(4, down)
                .build());

        syncNow(account);

        assertThat(awaitAttempt(account).get("last_sync_error")).isEqualTo("PROVIDER_UNAVAILABLE");
        assertThat(connector.asked()).hasSize(4);
    }

    @Test
    void anExpiredCursorReadsAgainFromADayBeforeTheLastSuccessfulRead() throws Exception {
        UUID account = imported(owner);
        Instant importDone = instantOf(account, "last_success_at");
        connector.use(twoPages().page(message("m-5", NOW.minusSeconds(30)))
                .failOnCall(1, new ProviderException(ProviderErrorCode.CURSOR_EXPIRED, "old")).build());

        syncNow(account);
        awaitSync(account);

        assertThat(connector.asked().get(1)).as("not from the start of the import: the mail before is stored")
                .isEqualTo(SyncCursor.initial(importDone.minus(Duration.ofDays(1))));
        assertThat(messages(account)).containsExactlyInAnyOrder("m-1", "m-2", "m-3", "m-4", "m-5");
        assertThat(row(account).get("last_sync_error")).isNull();

        Instant synced = instantOf(account, "last_sync_at");
        connector.use(twoPages().page(message("m-5", NOW.minusSeconds(30)))
                .failOnCall(1, new ProviderException(ProviderErrorCode.CURSOR_EXPIRED, "old")).build());
        syncNow(account);
        awaitRow(account, row -> !synced.equals(((Timestamp) row.get("last_sync_at")).toInstant()),
                "a second sync");
        assertThat(connector.asked().get(1)).as("from the last successful sync, once there was one")
                .isEqualTo(SyncCursor.initial(synced.minus(Duration.ofDays(1))));
    }

    @Test
    void aCursorThatExpiresTwiceInASyncIsRecordedAndKept() throws Exception {
        UUID account = imported(owner);
        String cursor = cursorOf(account);
        ProviderException expired = new ProviderException(ProviderErrorCode.CURSOR_EXPIRED, "old");
        connector.use(twoPages().failOnCall(1, expired).failOnCall(2, expired).build());

        syncNow(account);

        assertThat(awaitAttempt(account).get("last_sync_error")).isEqualTo("CURSOR_EXPIRED");
        assertThat(cursorOf(account)).as("the next sync tries the saved cursor again").isEqualTo(cursor);
        assertThat(row(account).get("import_status")).isEqualTo("DONE");
    }

    @Test
    void aThrottledSyncIsTriedAgain() throws Exception {
        UUID account = imported(owner);
        connector.use(twoPages().failOnCall(1, ProviderException.rateLimited("slow down", Duration.ofMillis(10)))
                .build());

        syncNow(account);

        assertThat(awaitSync(account).get("last_sync_error")).isNull();
        assertThat(connector.asked()).hasSize(2);
    }

    @ParameterizedTest
    @CsvSource({ "status = 'DISABLED', ACCOUNT_DISABLED", "status = 'AUTH_EXPIRED', AUTH_EXPIRED",
        "removed_at = now(), ACCOUNT_NOT_FOUND" })
    void anAccountThatChangesDuringASyncEndsItWithAnError(String change, String errorCode) throws Exception {
        UUID account = imported(owner);
        connector.use(twoPages().page(message("m-5", NOW.minusSeconds(60)))
                .page(message("m-6", NOW.minusSeconds(30))).build());
        connector.hold(1);

        syncNow(account);
        connector.awaitHeld();
        jdbc.update("update connected_account set " + change + " where id = ?", account);
        connector.letGo();

        Map<String, Object> row = awaitAttempt(account);
        assertThat(row.get("last_sync_error")).isEqualTo(errorCode);
        assertThat(row.get("import_status")).isEqualTo("DONE");
        assertThat(connector.asked()).as("the provider is not asked for the next page").hasSize(1);
    }

    @Test
    void stoppingTheApplicationDuringASyncRecordsNothing(CapturedOutput output) throws Exception {
        UUID account = imported(owner);
        connector.hold(1);

        syncNow(account);
        connector.awaitHeld();
        connector.interruptHeld();
        awaitLog(output, "Sync of account " + account + " stopped");

        Map<String, Object> row = row(account);
        assertThat(row.get("last_sync_error")).isNull();
        assertThat(row.get("last_sync_at")).isNull();
        assertThat(row.get("import_status")).isEqualTo("DONE");
    }

    @Test
    void anErrorInAWorkerDoesNotBlockTheAccount() throws Exception {
        UUID account = imported(owner);
        connector.use(new BrokenProvider());

        syncNow(account).andExpect(status().isAccepted());
        awaitCalls(1);
        connector.use(twoPages().build());
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (row(account).get("last_sync_at") == null && System.nanoTime() < deadline) {
            syncNow(account);
            Thread.sleep(50);
        }

        assertThat(row(account).get("last_sync_at")).as("a later request still gets a worker").isNotNull();
    }

    @Test
    void startingTheImportAgainDuringASyncStopsTheSyncWithoutTouchingTheNewImport() throws Exception {
        UUID account = imported(owner);
        // Two pages left for the sync; m-5 is older than the 30 days the new import reads.
        connector.use(twoPages().page(message("m-5", NOW.minus(60, ChronoUnit.DAYS)))
                .page(message("m-6", NOW.minusSeconds(30))).build());
        connector.hold(1);

        syncNow(account);
        connector.awaitHeld();
        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"DAYS_30\"}")).andExpect(status().isAccepted());
        connector.letGo();
        awaitImportEnd(account);

        assertThat(connector.asked()).as("the import read again from its own start")
                .contains(SyncCursor.initial(importSince(account)));
        Map<String, Object> row = row(account);
        assertThat(row.get("import_status")).isEqualTo("DONE");
        assertThat(row.get("import_range")).isEqualTo("DAYS_30");
        assertThat(row.get("last_sync_at")).as("the stopped sync recorded nothing").isNull();
        assertThat(row.get("last_sync_error")).isNull();
        assertThat(messages(account)).as("the sync's page was rolled back; the import read its own 30 days")
                .contains("m-6").doesNotContain("m-5");
    }

    @Test
    void aFailureAfterTheImportStartedAgainIsNotRecordedOnTheNewImport() throws Exception {
        UUID account = imported(owner);
        connector.use(twoPages().failOnCall(1, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"))
                .build());
        connector.hold(1);

        syncNow(account);
        connector.awaitHeld();
        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"DAYS_30\"}")).andExpect(status().isAccepted());
        connector.letGo();
        awaitImportEnd(account);

        Map<String, Object> row = row(account);
        assertThat(row.get("import_status")).isEqualTo("DONE");
        assertThat(row.get("last_sync_error")).isNull();
    }

    @Test
    void aSyncWaitingToTryAgainStopsWhenTheImportStartsAgain() throws Exception {
        UUID account = imported(owner);
        connector.use(twoPages().failOnCall(1, new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "down"))
                .build());
        connector.hold(1);

        syncNow(account);
        connector.awaitHeld();
        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"DAYS_30\"}")).andExpect(status().isAccepted());
        connector.letGo();
        awaitImportEnd(account);

        assertThat(connector.asked()).as("the failed sync call, then the two pages of the import; no more sync call")
                .hasSize(3);
        assertThat(row(account).get("last_sync_error")).isNull();
    }

    @Test
    void startingTheImportAgainForgetsTheSyncsOfTheOldOne() throws Exception {
        UUID account = imported(owner);
        connector.use(twoPages().failOnCall(1, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"))
                .build());
        syncNow(account);
        assertThat(awaitAttempt(account).get("last_sync_error")).isEqualTo("REQUEST_REJECTED");

        connector.use(twoPages().build());
        startImport(account);
        Map<String, Object> row = awaitImportEnd(account);

        assertThat(row.get("import_status")).isEqualTo("DONE");
        assertThat(row.get("last_sync_error")).isNull();
        assertThat(row.get("last_sync_at")).isNull();
        assertThat(row.get("last_sync_attempt_at")).isNull();
        mvc.perform(get("/api/accounts/{id}/sync", account).with(apiUser()))
                .andExpect(jsonPath("$.lastError").value(nullValue()))
                .andExpect(jsonPath("$.lastSyncAt").value(nullValue()));
    }

    // Probabilistic: a third pass would have to come within 200 ms after the second to be seen.
    @Test
    void requestsDuringASyncMakeOneMorePass() throws Exception {
        UUID account = imported(owner);
        connector.use(twoPages().build());
        connector.hold(1);

        syncNow(account);
        connector.awaitHeld();
        syncNow(account);
        syncNow(account);
        connector.letGo();
        awaitCalls(2);
        Thread.sleep(200);

        assertThat(connector.asked()).as("the held pass, then one more").hasSize(2);
    }

    @Test
    void syncNowRunsEvenWhenAutomaticSyncIsPaused() throws Exception {
        UUID account = imported(owner);
        jdbc.update("update connected_account set sync_enabled = false where id = ?", account);

        syncNow(account).andExpect(status().isAccepted());

        assertThat(awaitSync(account).get("last_sync_at")).isNotNull();
    }

    @Test
    void syncNowNeedsAFinishedImport() throws Exception {
        UUID account = connect(owner);
        syncNow(account).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IMPORT_NOT_DONE"));
        mvc.perform(get("/api/accounts/{id}/sync", account).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.importDone").value(false))
                .andExpect(jsonPath("$.lastSyncAt").value(nullValue()));

        connector.use(twoPages().failOnCall(1, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"))
                .build());
        startImport(account);
        awaitImportEnd(account);
        syncNow(account).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IMPORT_NOT_DONE"));
        assertThat(connector.asked()).as("a failed import is not synced").hasSize(1);
    }

    @Test
    void aDisabledAccountIsNotSynced() throws Exception {
        UUID account = imported(owner);
        jdbc.update("update connected_account set status = 'DISABLED' where id = ?", account);

        syncNow(account).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
    }

    @Test
    void anAccountOfAnotherOwnerOrRemovedIsNotFound() throws Exception {
        UUID theirs = connect(otherUser);
        syncNow(theirs).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
        mvc.perform(get("/api/accounts/{id}/sync", theirs).with(apiUser())).andExpect(status().isNotFound());

        UUID removed = imported(owner);
        jdbc.update("update connected_account set removed_at = now() where id = ?", removed);
        syncNow(removed).andExpect(status().isNotFound());
    }

    @Test
    void syncNowNeedsTheCsrfToken() throws Exception {
        UUID account = imported(owner);

        mvc.perform(post("/api/accounts/{id}/sync", account).with(apiUser())).andExpect(status().isForbidden());
    }

    private static FakeMessageProvider.Builder twoPages() {
        return FakeMessageProvider.builder(ScriptedProvider.TYPE.value())
                .page(message("m-1", WEEK_AGO), message("m-2", WEEK_AGO.plusSeconds(60)))
                .page(message("m-3", WEEK_AGO.plusSeconds(120)), message("m-4", WEEK_AGO.plusSeconds(180)));
    }

    private UUID connect(UUID user) {
        return registration.register(new RegisterAccountCommand(user, ScriptedProvider.TYPE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null), new TokenCredentials(TOKEN),
                null));
    }

    // An account of the owner whose first import (90 days) is DONE; the connector's record is cleared afterwards.
    private UUID imported(UUID user) throws Exception {
        UUID account = connect(user);
        startImport(account);
        assertThat(awaitImportEnd(account).get("import_status")).isEqualTo("DONE");
        connector.use(twoPages().build());
        return account;
    }

    private void startImport(UUID account) throws Exception {
        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"DAYS_90\"}")).andExpect(status().isAccepted());
    }

    private ResultActions syncNow(UUID account) throws Exception {
        return mvc.perform(post("/api/accounts/{id}/sync", account).with(apiUser()).with(csrf()));
    }

    private Map<String, Object> row(UUID account) {
        return jdbc.queryForMap("select * from sync_checkpoint where account_id = ?", account);
    }

    private List<String> messages(UUID account) {
        return jdbc.queryForList("select m.external_message_id from message m join conversation c"
                + " on c.id = m.conversation_id where c.account_id = ?", String.class, account);
    }

    private Instant importSince(UUID account) {
        return instantOf(account, "import_since");
    }

    private Instant instantOf(UUID account, String column) {
        return jdbc.queryForObject("select " + column + " from sync_checkpoint where account_id = ?",
                OffsetDateTime.class, account).toInstant();
    }

    private String cursorOf(UUID account) {
        return jdbc.queryForObject("select cursor from sync_checkpoint where account_id = ?", String.class, account);
    }

    private Map<String, Object> awaitImportEnd(UUID account) throws InterruptedException {
        return awaitRow(account, row -> !"RUNNING".equals(row.get("import_status")), "the import to end");
    }

    private Map<String, Object> awaitSync(UUID account) throws InterruptedException {
        return awaitRow(account, row -> row.get("last_sync_at") != null, "a successful sync");
    }

    // The row once a sync was tried and has ended, successful or not.
    private Map<String, Object> awaitAttempt(UUID account) throws InterruptedException {
        return awaitRow(account, row -> row.get("last_sync_at") != null || row.get("last_sync_error") != null,
                "a sync to end");
    }

    private Map<String, Object> awaitRow(UUID account, Predicate<Map<String, Object>> done, String what)
            throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (System.nanoTime() < deadline) {
            Map<String, Object> row = row(account);
            if (done.test(row)) {
                return row;
            }
            Thread.sleep(25);
        }
        throw new AssertionError("Waited in vain for " + what + " of " + account);
    }

    private void awaitCalls(int calls) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (connector.asked().size() < calls) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("The connector was asked " + connector.asked().size() + " times");
            }
            Thread.sleep(25);
        }
    }

    private static void awaitLog(CapturedOutput output, String text) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (!output.getAll().contains(text)) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("Never logged: " + text);
            }
            Thread.sleep(25);
        }
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

    // Fails with an Error, which no catch for exceptions stops.
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
            throw new StackOverflowError("deep recursion in a connector");
        }

    }

}
