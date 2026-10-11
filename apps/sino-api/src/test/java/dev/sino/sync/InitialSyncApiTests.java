package dev.sino.sync;

import static dev.sino.provider.FakeMessageProvider.message;
import static dev.sino.provider.FakeMessageProvider.messageWithoutSentAt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doCallRealMethod;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
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
import dev.sino.sync.application.ImportResumer;

/**
 * The first import (BE-45) through HTTP on the whole application and a real PostgreSQL, with a connector each test
 * scripts. The import runs in the background, so the tests poll its status. Waits are milliseconds here.
 */
@SpringBootTest(properties = { "sino.sync.rate-limit-wait=20ms", "sino.sync.rate-limit-max-wait=50ms",
    "sino.sync.unavailable-waits=10ms,10ms,10ms" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, InitialSyncApiTests.Connectors.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class InitialSyncApiTests {

    private static final String TOKEN = "fake-sync-token-1";
    private static final Instant NOW = Instant.now();
    private static final Instant WEEK_AGO = NOW.minus(7, ChronoUnit.DAYS);
    private static final Instant TWO_MONTHS_AGO = NOW.minus(60, ChronoUnit.DAYS);

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
    private ImportResumer resumer;

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
        connector.use(threePages().build());
    }

    @Test
    void estimatesFromTheConnector() throws Exception {
        connector.use(threePages().estimate(1180).build());
        UUID account = connect(owner);

        mvc.perform(get("/api/accounts/{id}/initial-sync/estimate", account).param("range", "DAYS_90")
                .with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages").value(1180))
                .andExpect(jsonPath("$.minMinutes").value(10))
                .andExpect(jsonPath("$.maxMinutes").value(20));
    }

    @Test
    void noEstimateWhenTheConnectorCannotTellOrFails() throws Exception {
        UUID account = connect(owner);
        mvc.perform(get("/api/accounts/{id}/initial-sync/estimate", account).param("range", "ALL").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages").value(nullValue()))
                .andExpect(jsonPath("$.minMinutes").value(nullValue()))
                .andExpect(jsonPath("$.maxMinutes").value(nullValue()));

        connector.use(threePages().estimate(5).estimateFailure(new ProviderException(
                ProviderErrorCode.PROVIDER_UNAVAILABLE, "down")).build());
        mvc.perform(get("/api/accounts/{id}/initial-sync/estimate", account).param("range", "ALL").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages").value(nullValue()));
    }

    @Test
    void beforeAnyImportNothingHasStarted() throws Exception {
        UUID account = connect(owner);

        mvc.perform(get("/api/accounts/{id}/initial-sync", account).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("NOT_STARTED"))
                .andExpect(jsonPath("$.range").value(nullValue()))
                .andExpect(jsonPath("$.imported").value(0))
                .andExpect(jsonPath("$.skipped").value(0))
                .andExpect(jsonPath("$.estimated").value(nullValue()))
                .andExpect(jsonPath("$.remainingMinutes").value(nullValue()))
                .andExpect(jsonPath("$.storedMessages").value(0))
                .andExpect(jsonPath("$.startedAt").value(nullValue()))
                .andExpect(jsonPath("$.finishedAt").value(nullValue()))
                .andExpect(jsonPath("$.errorCode").value(nullValue()));
    }

    @Test
    void importsEveryPageInTheBackground() throws Exception {
        connector.use(threePages().estimate(5).build());
        UUID account = connect(owner);

        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"DAYS_90\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.range").value("DAYS_90"));
        Map<String, Object> done = awaitEnd(account);

        assertThat(done).containsEntry("status", "DONE").containsEntry("range", "DAYS_90")
                .containsEntry("imported", 5).containsEntry("skipped", 1).containsEntry("estimated", 5)
                .containsEntry("storedMessages", 5).containsEntry("errorCode", null)
                .containsEntry("remainingMinutes", null);
        assertThat(done.get("startedAt")).isNotNull();
        assertThat(done.get("finishedAt")).isNotNull();
        SyncCursor first = connector.asked().getFirst();
        assertThat(first.isInitial()).isTrue();
        assertThat(first.since()).isBetween(NOW.minus(91, ChronoUnit.DAYS), Instant.now().minus(89, ChronoUnit.DAYS));
        assertThat(cursorOf(account)).as("kept for following changes later (F07)").startsWith("page-3@");
    }

    @Test
    void startingTwiceRunsOnce() throws Exception {
        UUID account = connect(owner);
        // Held on the second page: the first one is stored, so starting over would show.
        connector.hold(2);

        start(account, "DAYS_90").andExpect(status().isAccepted());
        connector.awaitHeld();
        start(account, "DAYS_30").andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.range").value("DAYS_90"))
                .andExpect(jsonPath("$.imported").value(2));
        resumer.resumeRunning();
        connector.letGo();

        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("range", "DAYS_90")
                .containsEntry("imported", 5);
        // BE-48: the requests that came during the import make one more look at the row, which is DONE by then,
        // so the account is synced once from the saved cursor; that reads what changed while it was imported.
        awaitSyncInDatabase(account);
        assertThat(connector.asked()).hasSize(4);
        assertThat(connector.asked().get(3)).isEqualTo(new SyncCursor(cursorOf(account)));
    }

    @Test
    void aThrottledPageIsTriedAgain() throws Exception {
        connector.use(threePages().failOnCall(2, ProviderException.rateLimited("slow down", Duration.ofMillis(10)))
                .build());
        UUID account = connect(owner);

        start(account, "DAYS_90");

        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("imported", 5);
        assertThat(connector.asked()).hasSize(4);
    }

    @Test
    void anUnreachableProviderFailsAfterThreeRetriesAndKeepsWhatWasStored() throws Exception {
        FakeMessageProvider.Builder pages = threePages();
        for (int call = 2; call <= 5; call++) {
            pages.failOnCall(call, new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "down"));
        }
        connector.use(pages.build());
        UUID account = connect(owner);

        start(account, "DAYS_90");

        Map<String, Object> failed = awaitEnd(account);
        assertThat(failed).containsEntry("status", "FAILED")
                .containsEntry("errorCode", "PROVIDER_UNAVAILABLE").containsEntry("imported", 2);
        assertThat(failed.get("finishedAt")).isNotNull();
        assertThat(connector.asked()).hasSize(5);
        assertThat(cursorOf(account)).startsWith("page-1@");
    }

    @Test
    void theRetriesCountAgainAfterAPageGoesThrough() throws Exception {
        ProviderException down = new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "down");
        connector.use(threePages().failOnCall(2, down).failOnCall(3, down).failOnCall(5, down).failOnCall(6, down)
                .build());
        UUID account = connect(owner);

        start(account, "DAYS_90");

        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("imported", 5);
    }

    @Test
    void fiveThrottledAnswersInARowAreBorneTheSixthFails() throws Exception {
        FakeMessageProvider.Builder borne = threePages();
        FakeMessageProvider.Builder tooMany = threePages();
        for (int call = 2; call <= 6; call++) {
            borne.failOnCall(call, ProviderException.rateLimited("slow down", Duration.ofMillis(5)));
            tooMany.failOnCall(call, ProviderException.rateLimited("slow down", Duration.ofMillis(5)));
        }
        tooMany.failOnCall(7, ProviderException.rateLimited("slow down", Duration.ofMillis(5)));
        UUID account = connect(owner);

        connector.use(borne.build());
        start(account, "DAYS_90");
        assertThat(awaitEnd(account)).containsEntry("status", "DONE");

        connector.use(tooMany.build());
        start(account, "DAYS_90");
        assertThat(awaitEnd(account)).containsEntry("status", "FAILED").containsEntry("errorCode", "RATE_LIMITED");
    }

    @Test
    void aWaitLongerThanTheLongestIsCut() throws Exception {
        connector.use(threePages().failOnCall(2, ProviderException.rateLimited("slow down", Duration.ofMinutes(10)))
                .build());
        UUID account = connect(owner);

        start(account, "DAYS_90");

        assertThat(awaitEnd(account)).as("waited 50 ms, not 10 minutes").containsEntry("status", "DONE");
    }

    @Test
    void aConnectorThatKeepsGivingTheSameCursorFails() throws Exception {
        connector.use(new StuckProvider());
        UUID account = connect(owner);

        start(account, "ALL");

        assertThat(awaitEnd(account)).containsEntry("status", "FAILED").containsEntry("errorCode", "CURSOR_STUCK");
        assertThat(connector.asked()).hasSize(2);
    }

    @Test
    void aDisabledAccountIsNeitherEstimatedNorImported() throws Exception {
        UUID account = connect(owner);
        jdbc.update("update connected_account set status = 'DISABLED' where id = ?", account);

        mvc.perform(get("/api/accounts/{id}/initial-sync/estimate", account).param("range", "ALL").with(apiUser()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
        start(account, "ALL").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
        mvc.perform(get("/api/accounts/{id}/initial-sync", account).with(apiUser()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("NOT_STARTED"));
        assertThat(connector.asked()).isEmpty();
    }

    @Test
    void anAccountTurnedOffMidwayStopsTheImport() throws Exception {
        UUID account = connect(owner);
        connector.hold(2);

        start(account, "DAYS_90");
        connector.awaitHeld();
        jdbc.update("update connected_account set status = 'DISABLED' where id = ?", account);
        connector.letGo();

        assertThat(awaitEnd(account)).containsEntry("status", "FAILED").containsEntry("errorCode", "ACCOUNT_DISABLED")
                .containsEntry("imported", 3);
    }

    @Test
    void aStoppedImportStaysRunningAndGoesOnLater(CapturedOutput output) throws Exception {
        UUID account = connect(owner);
        connector.hold(2);
        start(account, "DAYS_90");
        connector.awaitHeld();

        connector.interruptHeld();
        awaitLog(output, "Initial sync of account " + account + " stopped");

        assertThat(jdbc.queryForObject("select import_status from sync_checkpoint where account_id = ?",
                String.class, account)).isEqualTo("RUNNING");
        assertThat(cursorOf(account)).startsWith("page-1@");
        resumer.resumeRunning();
        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("imported", 5);
    }

    @Test
    void aStopDuringTheLastRetryStillLeavesTheImportRunning(CapturedOutput output) throws Exception {
        ProviderException down = new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "down");
        connector.use(threePages().failOnCall(2, down).failOnCall(3, down).failOnCall(4, down).build());
        connector.hold(5);
        UUID account = connect(owner);
        start(account, "DAYS_90");
        connector.awaitHeld();

        // The fourth failure in a row would fail the import, but the thread is being stopped.
        connector.interruptHeld();
        awaitLog(output, "Initial sync of account " + account + " stopped");

        assertThat(jdbc.queryForObject("select import_status from sync_checkpoint where account_id = ?",
                String.class, account)).isEqualTo("RUNNING");
        resumer.resumeRunning();
        assertThat(awaitEnd(account)).containsEntry("status", "DONE");
    }

    @Test
    void aRunningImportWithoutWorkerIsTakenUpAgainByStart() throws Exception {
        UUID account = connect(owner);
        Instant since = NOW.minus(90, ChronoUnit.DAYS);
        jdbc.update("""
                insert into sync_checkpoint (account_id, cursor, import_status, import_range, import_since,
                    imported_count, skipped_count, run_imported_count, last_started_at, updated_at)
                values (?, ?, 'RUNNING', 'DAYS_90', ?, 2, 0, 2, now(), now())
                """, account, "page-1@" + since, java.sql.Timestamp.from(since));

        start(account, "DAYS_90").andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("RUNNING"));

        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("imported", 5);
    }

    @Test
    void anImportThatGoesOnMeasuresItsSpeedFromItsOwnStart() throws Exception {
        UUID account = connect(owner);
        Instant since = NOW.minus(90, ChronoUnit.DAYS);
        jdbc.update("""
                insert into sync_checkpoint (account_id, cursor, import_status, import_range, import_since,
                    imported_count, skipped_count, run_imported_count, last_started_at, run_started_at, updated_at)
                values (?, ?, 'RUNNING', 'DAYS_90', ?, 2, 0, 2, now() - interval '10 hours',
                        now() - interval '10 hours', now())
                """, account, "page-1@" + since, java.sql.Timestamp.from(since));
        connector.hold(1);

        resumer.resumeRunning();
        connector.awaitHeld();

        assertThat(jdbc.queryForObject("select run_imported_count from sync_checkpoint where account_id = ?",
                Integer.class, account)).isZero();
        assertThat(jdbc.queryForObject("select run_started_at > now() - interval '1 minute' from sync_checkpoint"
                + " where account_id = ?", Boolean.class, account)).isTrue();
        connector.letGo();
        awaitEnd(account);
    }

    @Test
    void anExpiredCursorStartsOverOnce() throws Exception {
        connector.use(threePages().failOnCall(2, new ProviderException(ProviderErrorCode.CURSOR_EXPIRED, "gone"))
                .build());
        UUID account = connect(owner);

        start(account, "DAYS_90");

        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("imported", 5);
        assertThat(connector.asked()).extracting(SyncCursor::isInitial).containsExactly(true, false, true, false,
                false);
    }

    @Test
    void aCursorThatExpiresAgainFails() throws Exception {
        connector.use(threePages()
                .failOnCall(2, new ProviderException(ProviderErrorCode.CURSOR_EXPIRED, "gone"))
                .failOnCall(4, new ProviderException(ProviderErrorCode.CURSOR_EXPIRED, "gone again")).build());
        UUID account = connect(owner);

        start(account, "DAYS_90");

        assertThat(awaitEnd(account)).containsEntry("status", "FAILED").containsEntry("errorCode", "CURSOR_EXPIRED");
    }

    @Test
    void anExpiredAuthorizationFailsAtOnce() throws Exception {
        connector.use(threePages().failOnCall(2, new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "refused"))
                .build());
        UUID account = connect(owner);

        start(account, "DAYS_90");

        assertThat(awaitEnd(account)).containsEntry("status", "FAILED").containsEntry("errorCode", "AUTH_EXPIRED")
                .containsEntry("imported", 2);
        assertThat(connector.asked()).hasSize(2);
        assertThat(cursorOf(account)).startsWith("page-1@");
    }

    @Test
    void anAccountRemovedMidwayFailsTheImport() throws Exception {
        UUID account = connect(owner);
        connector.hold(2);

        start(account, "DAYS_90");
        connector.awaitHeld();
        jdbc.update("update connected_account set removed_at = now() where id = ?", account);
        connector.letGo();

        // The API no longer shows a removed account, so the end is read from the database.
        assertThat(awaitEndInDatabase(account)).containsEntry("import_status", "FAILED")
                .containsEntry("last_error_code", "ACCOUNT_NOT_FOUND");
    }

    @Test
    void aFailedStoreLeavesTheCursorBeforeThatPage() throws Exception {
        // The transaction proxy wraps the spy: stub the spy itself, or the stubbing call would need a transaction.
        ConversationStore spy = AopTestUtils.getUltimateTargetObject(store);
        doCallRealMethod().doThrow(new IllegalStateException("the disk is full")).when(spy).store(any(), any());
        UUID account = connect(owner);

        start(account, "DAYS_90");

        assertThat(awaitEnd(account)).containsEntry("status", "FAILED").containsEntry("errorCode", "INTERNAL")
                .containsEntry("imported", 2);
        assertThat(cursorOf(account)).startsWith("page-1@");
    }

    @Test
    void aFailedImportOfTheSameRangeGoesOnFromWhereItStopped() throws Exception {
        connector.use(threePages().failOnCall(2, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"))
                .build());
        UUID account = connect(owner);
        start(account, "DAYS_90");
        assertThat(awaitEnd(account)).containsEntry("status", "FAILED").containsEntry("errorCode", "REQUEST_REJECTED");

        connector.use(threePages().build());
        start(account, "DAYS_90");

        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("imported", 5)
                .containsEntry("errorCode", null);
        assertThat(connector.asked()).hasSize(2);
        assertThat(connector.asked().getFirst().value()).startsWith("page-1@");
    }

    @Test
    void anotherRangeStartsOver() throws Exception {
        connector.use(threePages().failOnCall(2, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"))
                .build());
        UUID account = connect(owner);
        start(account, "DAYS_90");
        awaitEnd(account);

        connector.use(threePages().build());
        start(account, "DAYS_30");

        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("range", "DAYS_30");
        SyncCursor first = connector.asked().getFirst();
        assertThat(first.isInitial()).isTrue();
        assertThat(first.since()).isBetween(NOW.minus(31, ChronoUnit.DAYS), Instant.now().minus(29, ChronoUnit.DAYS));
    }

    @Test
    void aFinishedImportStartsOverWhenStartedAgain() throws Exception {
        UUID account = connect(owner);
        start(account, "ALL");
        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("imported", 5);

        connector.use(FakeMessageProvider.builder(ScriptedProvider.TYPE.value())
                .page(new FakeMessageProvider.RawMessage("m-1", "conversation-1", WEEK_AGO, "Message m-1, edited"),
                        message("m-2", WEEK_AGO.plusSeconds(60)))
                .page(message("m-3", TWO_MONTHS_AGO), messageWithoutSentAt("m-x"))
                .page(message("m-4", WEEK_AGO.plusSeconds(120)), message("m-5", WEEK_AGO.plusSeconds(180))).build());
        start(account, "ALL");

        assertThat(awaitEnd(account)).as("the same mail again, one message edited").containsEntry("status", "DONE")
                .containsEntry("imported", 1).containsEntry("storedMessages", 5);
        SyncCursor first = connector.asked().getFirst();
        assertThat(first.isInitial()).isTrue();
        assertThat(first.since()).isNull();
    }

    @Test
    void anImportStillRunningGoesOnWhenTheApplicationIsReady() throws Exception {
        UUID account = connect(owner);
        Instant since = NOW.minus(90, ChronoUnit.DAYS);
        jdbc.update("""
                insert into sync_checkpoint (account_id, cursor, import_status, import_range, import_since,
                    imported_count, skipped_count, run_imported_count, last_started_at, updated_at)
                values (?, ?, 'RUNNING', 'DAYS_90', ?, 2, 0, 2, now(), now())
                """, account, "page-1@" + since, java.sql.Timestamp.from(since));

        resumer.resumeRunning();

        assertThat(awaitEnd(account)).containsEntry("status", "DONE").containsEntry("imported", 5);
        assertThat(connector.asked().getFirst().value()).isEqualTo("page-1@" + since);
    }

    @Test
    void anAccountOutOfReachIsNotFound() throws Exception {
        UUID foreign = connect(otherUser);
        UUID removed = connect(owner);
        jdbc.update("update connected_account set removed_at = now() where id = ?", removed);

        for (UUID account : List.of(foreign, removed, UUID.randomUUID())) {
            mvc.perform(get("/api/accounts/{id}/initial-sync", account).with(apiUser()))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
            mvc.perform(get("/api/accounts/{id}/initial-sync/estimate", account).param("range", "ALL")
                    .with(apiUser()))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
            start(account, "ALL").andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
        }
        assertThat(jdbc.queryForObject("select count(*) from sync_checkpoint", Long.class)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = { "{\"range\": \"DAYS_7\"}", "{\"range\": 30}", "not json" })
    void aStrangeRangeIsABadRequest(String body) throws Exception {
        UUID account = connect(owner);

        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        mvc.perform(get("/api/accounts/{id}/initial-sync/estimate", account).param("range", "DAYS_7")
                .with(apiUser()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void aMissingRangeIsABadRequest() throws Exception {
        UUID account = connect(owner);

        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void startingNeedsTheCsrfToken() throws Exception {
        UUID account = connect(owner);

        mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser())
                .contentType(APPLICATION_JSON).content("{\"range\": \"ALL\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void theLogsNameTheAccountButNeverTheMailOrTheToken(CapturedOutput output) throws Exception {
        connector.use(threePages().failOnCall(2, ProviderException.rateLimited("slow down", Duration.ofMillis(10)))
                .build());
        UUID account = connect(owner);

        start(account, "DAYS_90");
        awaitEnd(account);

        assertThat(output.getAll()).contains(account.toString()).contains("RATE_LIMITED")
                .as("the ID of the skipped item, not its content").contains("m-x")
                .doesNotContain("Message m-").doesNotContain(TOKEN);
    }

    private static FakeMessageProvider.Builder threePages() {
        return FakeMessageProvider.builder(ScriptedProvider.TYPE.value())
                .page(message("m-1", WEEK_AGO), message("m-2", WEEK_AGO.plusSeconds(60)))
                .page(message("m-3", TWO_MONTHS_AGO), messageWithoutSentAt("m-x"))
                .page(message("m-4", WEEK_AGO.plusSeconds(120)), message("m-5", WEEK_AGO.plusSeconds(180)));
    }

    private UUID connect(UUID user) {
        return registration.register(new RegisterAccountCommand(user, ScriptedProvider.TYPE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null), new TokenCredentials(TOKEN),
                null));
    }

    private org.springframework.test.web.servlet.ResultActions start(UUID account, String range) throws Exception {
        return mvc.perform(post("/api/accounts/{id}/initial-sync", account).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"range\": \"" + range + "\"}"));
    }

    // The status the API shows once the import has ended, DONE or FAILED.
    private Map<String, Object> awaitEnd(UUID account) throws Exception {
        awaitEndInDatabase(account);
        String body = mvc.perform(get("/api/accounts/{id}/initial-sync", account).with(apiUser()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$");
    }

    private Map<String, Object> awaitEndInDatabase(UUID account) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (System.nanoTime() < deadline) {
            Map<String, Object> row = jdbc.queryForMap("select import_status, last_error_code from sync_checkpoint"
                    + " where account_id = ?", account);
            if (!"RUNNING".equals(row.get("import_status"))) {
                return row;
            }
            Thread.sleep(25);
        }
        throw new AssertionError("The import of " + account + " did not end in time");
    }

    private void awaitSyncInDatabase(UUID account) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (jdbc.queryForObject("select last_sync_at from sync_checkpoint where account_id = ?", Object.class,
                account) == null) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("The account " + account + " was not synced in time");
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

    private String cursorOf(UUID account) {
        return jdbc.queryForObject("select cursor from sync_checkpoint where account_id = ?", String.class, account);
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

    // Says there is more, and gives the cursor it was asked for back again.
    private static final class StuckProvider implements MessageProvider {

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
            return new AccountProfile("stuck", "Stuck", null, null);
        }

        @Override
        public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
            return new SyncBatch(List.of(), List.of(), List.of(), new SyncCursor("stuck"), true);
        }

    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Connectors {

        @Bean
        ScriptedProvider scriptedProvider() {
            return new ScriptedProvider();
        }

    }

}
