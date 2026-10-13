package dev.sino.sync;

import static dev.sino.provider.FakeMessageProvider.message;
import static org.assertj.core.api.Assertions.assertThat;

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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderPushReceived;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.TokenCredentials;
import dev.sino.sync.application.PushNotices;

/**
 * A provider's notice of changes (BE-52, D-76) syncs the accounts watched under its address, whatever its case, and
 * only those that sync on their own. Same configuration as {@link InitialSyncApiTests}, so the same context.
 */
@SpringBootTest(properties = { "sino.sync.rate-limit-wait=20ms", "sino.sync.rate-limit-max-wait=50ms",
    "sino.sync.unavailable-waits=10ms,10ms,10ms" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, InitialSyncApiTests.Connectors.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class PushNoticeTests {

    private static final Instant WEEK_AGO = Instant.now().minus(7, ChronoUnit.DAYS);
    private static final String MAILBOX = "Fake.Owner@fake.test";

    @Autowired
    private PushNotices notices;

    @Autowired
    private ApplicationEventPublisher events;

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
        connector.use(FakeMessageProvider.builder(ScriptedProvider.TYPE.value()).page(message("m-1", WEEK_AGO))
                .build());
    }

    @Test
    void aNoticeSyncsTheAccountWatchedUnderItsAddress() throws Exception {
        UUID watched = watched(connect(), MAILBOX);
        UUID other = watched(connect(), "someone.else@fake.test");

        events.publishEvent(new ProviderPushReceived(ScriptedProvider.TYPE, "fake.owner@FAKE.test", Instant.now()));

        assertThat(awaitRow(watched, row -> row.get("last_sync_at") != null).get("last_sync_error")).isNull();
        assertThat(jdbc.queryForObject("select count(*) from message", Integer.class)).isEqualTo(1);
        assertThat(notices.accountsFor(ScriptedProvider.TYPE, "SOMEONE.ELSE@fake.test")).containsExactly(other);
        assertThat(row(other).get("last_sync_attempt_at")).as("not asked").isNull();
    }

    @Test
    void aNoticeSyncsOnlyAccountsThatSyncOnTheirOwn() {
        UUID syncing = watched(connect(), MAILBOX);
        UUID paused = watched(connect(), MAILBOX);
        jdbc.update("update connected_account set sync_enabled = false where id = ?", paused);
        UUID disabled = watched(connect(), MAILBOX);
        jdbc.update("update connected_account set status = 'DISABLED' where id = ?", disabled);
        UUID expired = watched(connect(), MAILBOX);
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", expired);
        UUID removed = watched(connect(), MAILBOX);
        jdbc.update("update connected_account set removed_at = now() where id = ?", removed);

        assertThat(notices.accountsFor(ScriptedProvider.TYPE, MAILBOX)).containsExactly(syncing);
    }

    @Test
    void aNoticeOfAnotherProviderSyncsNothing() {
        watched(connect(), MAILBOX);

        assertThat(notices.accountsFor(ProviderType.of("gmail"), MAILBOX)).isEmpty();
    }

    @Test
    void aNoticeForNoWatchedAccountIsSaidWithoutTheAddress(CapturedOutput output) {
        watched(connect(), MAILBOX);

        events.publishEvent(new ProviderPushReceived(ScriptedProvider.TYPE, "removed.owner@fake.test",
                Instant.now()));

        assertThat(output.getAll()).contains("notice matches no account that syncs on its own")
                .doesNotContain("removed.owner");
    }

    private UUID connect() {
        return registration.register(new RegisterAccountCommand(owner, ScriptedProvider.TYPE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null),
                new TokenCredentials("fake-sync-token-1"), null));
    }

    // A DONE row watched under this address, last synced a moment ago.
    private UUID watched(UUID account, String address) {
        jdbc.update("insert into sync_checkpoint (account_id, cursor, import_status, import_range, imported_count,"
                + " skipped_count, run_imported_count, last_started_at, last_success_at, watch_address,"
                + " watch_expires_at, updated_at) values (?, 'page-0', 'DONE', 'ALL', 0, 0, 0, now(), now(), ?,"
                + " now() + interval '5 days', now())", account, address);
        return account;
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
