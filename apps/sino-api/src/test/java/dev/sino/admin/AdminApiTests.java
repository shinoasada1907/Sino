package dev.sino.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.sync.infrastructure.SyncCheckpoints;

/**
 * The read-only admin API (D-264) through HTTP on the whole application and a real PostgreSQL: two users, accounts in
 * several states, mail stored by the real {@link ConversationStore} and sync state written by the real
 * {@link SyncCheckpoints}. The admin sees numbers and statuses, never the mail itself.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class AdminApiTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final String SUBJECT = "Kế hoạch riêng tư của owner";
    private static final String TEXT = "Nội dung thư không ai khác được đọc";
    private static final String SENDER = "alice@example.test";
    private static final NormalizedParticipant ALICE = new NormalizedParticipant(SENDER, "Alice", null, false);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private ConnectedAccountRepository accounts;

    @Autowired
    private ConversationStore store;

    @Autowired
    private SyncCheckpoints checkpoints;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;
    private UUID bob;
    private UUID mailbox;
    private UUID expired;
    private UUID turnedOff;

    @BeforeEach
    void twoUsersAndTheirAccounts() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from sync_checkpoint");
        jdbc.update("delete from connected_account");
        jdbc.update("delete from task");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        bob = users.save(new AppUser("bob@admin.test", "Bob")).id();

        // The owner's mailbox: imported, two messages, its last sync failed.
        mailbox = connect(owner, "owner-sub", "owner@gmail.test", "2026-01-01T00:00:00Z");
        store(mailbox, message("m-1"), message("m-2"));
        checkpoints.start(mailbox, "ALL", null);
        checkpoints.advance(mailbox, "page-1", 2, 0, true);
        checkpoints.syncFailed(mailbox, "RATE_LIMITED");
        // A second account of the owner whose import stopped: Google no longer accepts it.
        ConnectedAccount authExpired = ConnectedAccount.register(owner, GMAIL, "work-sub", "Work", null,
                "owner@work.test");
        authExpired.markAuthExpired();
        expired = accounts.save(authExpired).id();
        connectedAt(expired, "2026-02-01T00:00:00Z");
        checkpoints.start(expired, "DAYS_30", Instant.parse("2026-01-02T00:00:00Z"));
        checkpoints.fail(expired, "AUTH_EXPIRED");
        // A removed account: neither it nor its mail counts.
        ConnectedAccount gone = ConnectedAccount.register(owner, GMAIL, "old-sub", "Old", null, "old@gmail.test");
        UUID removed = accounts.save(gone).id();
        store(removed, message("m-3"));
        gone.remove(Instant.parse("2026-03-01T00:00:00Z"));
        accounts.save(gone);
        // Bob turned his only account off and never imported it.
        ConnectedAccount bobs = ConnectedAccount.register(bob, GMAIL, "bob-sub", "Bob", null, "bob@gmail.test");
        bobs.disable();
        turnedOff = accounts.save(bobs).id();
        connectedAt(turnedOff, "2026-03-01T00:00:00Z");
    }

    @Test
    void theOverviewCountsUsersAccountsStatusesErrorsAndMail() throws Exception {
        mvc.perform(get("/api/admin/overview").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generatedAt").isString())
                .andExpect(jsonPath("$.users").value(2))
                .andExpect(jsonPath("$.accounts").value(3))
                .andExpect(jsonPath("$.accountsByStatus.CONNECTED").value(1))
                .andExpect(jsonPath("$.accountsByStatus.DEGRADED").value(0))
                .andExpect(jsonPath("$.accountsByStatus.AUTH_EXPIRED").value(1))
                .andExpect(jsonPath("$.accountsByStatus.ERROR").value(0))
                .andExpect(jsonPath("$.accountsByStatus.DISABLED").value(1))
                .andExpect(jsonPath("$.accountsWithSyncErrors").value(2))
                .andExpect(jsonPath("$.storedMessages").value(2));
    }

    @Test
    void theUsersComeOldestFirstWithTheirAccountsCounted() throws Exception {
        mvc.perform(get("/api/admin/users").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generatedAt").isString())
                .andExpect(jsonPath("$.users[*].email").value(contains("owner@sino.test", "bob@admin.test")))
                .andExpect(jsonPath("$.users[0].id").value(owner.toString()))
                .andExpect(jsonPath("$.users[0].displayName").value("Test Owner"))
                .andExpect(jsonPath("$.users[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.users[0].createdAt").isString())
                .andExpect(jsonPath("$.users[0].accounts").value(2))
                .andExpect(jsonPath("$.users[1].id").value(bob.toString()))
                .andExpect(jsonPath("$.users[1].accounts").value(1));
    }

    @Test
    void theAccountsComeOldestFirstWithTheirSyncAndMailCount() throws Exception {
        mvc.perform(get("/api/admin/accounts").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generatedAt").isString())
                .andExpect(jsonPath("$.accounts[*].id")
                        .value(contains(mailbox.toString(), expired.toString(), turnedOff.toString())))
                .andExpect(jsonPath("$.accounts[0].ownerId").value(owner.toString()))
                .andExpect(jsonPath("$.accounts[0].provider").value("gmail"))
                .andExpect(jsonPath("$.accounts[0].address").value("owner@gmail.test"))
                .andExpect(jsonPath("$.accounts[0].status").value("CONNECTED"))
                .andExpect(jsonPath("$.accounts[0].syncEnabled").value(true))
                .andExpect(jsonPath("$.accounts[0].createdAt").value("2026-01-01T00:00:00Z"))
                .andExpect(jsonPath("$.accounts[0].storedMessages").value(2))
                .andExpect(jsonPath("$.accounts[0].sync.importStatus").value("DONE"))
                .andExpect(jsonPath("$.accounts[0].sync.importError").value(nullValue()))
                .andExpect(jsonPath("$.accounts[0].sync.syncError").value("RATE_LIMITED"))
                .andExpect(jsonPath("$.accounts[0].sync.push").value("OFF"))
                .andExpect(jsonPath("$.accounts[1].status").value("AUTH_EXPIRED"))
                .andExpect(jsonPath("$.accounts[1].sync.importStatus").value("FAILED"))
                .andExpect(jsonPath("$.accounts[1].sync.importError").value("AUTH_EXPIRED"))
                .andExpect(jsonPath("$.accounts[2].ownerId").value(bob.toString()))
                .andExpect(jsonPath("$.accounts[2].status").value("DISABLED"))
                .andExpect(jsonPath("$.accounts[2].storedMessages").value(0))
                .andExpect(jsonPath("$.accounts[2].sync.importStatus").value("NONE"))
                .andExpect(jsonPath("$.accounts[2].sync.lastSyncAt").value(nullValue()))
                .andExpect(jsonPath("$.accounts[2].sync.push").value("OFF"))
                .andExpect(jsonPath("$.accounts[0]", not(hasKey("externalAccountId"))));
    }

    @Test
    void noAnswerCarriesTheMailItself() throws Exception {
        for (String path : List.of("/api/admin/overview", "/api/admin/users", "/api/admin/accounts")) {
            String body = mvc.perform(get(path).with(admin())).andExpect(status().isOk()).andReturn().getResponse()
                    .getContentAsString();

            assertThat(body).as(path).doesNotContain(SUBJECT).doesNotContain(TEXT).doesNotContain(SENDER)
                    .doesNotContain("owner-sub").doesNotContainIgnoringCase("token");
        }
    }

    @Test
    void theOwnerCannotReadTheAdminApi() throws Exception {
        for (String path : List.of("/api/admin/overview", "/api/admin/users", "/api/admin/accounts")) {
            mvc.perform(get(path).with(user("owner@sino.test")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
    }

    @Test
    void nobodySignedInIs401() throws Exception {
        for (String path : List.of("/api/admin/overview", "/api/admin/users", "/api/admin/accounts")) {
            mvc.perform(get(path))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        }
    }

    private UUID connect(UUID user, String externalAccountId, String address, String at) {
        UUID id = accounts.save(ConnectedAccount.register(user, GMAIL, externalAccountId, "Account", null, address))
                .id();
        connectedAt(id, at);
        return id;
    }

    private void connectedAt(UUID account, String at) {
        jdbc.update("update connected_account set created_at = ? where id = ?", Timestamp.from(Instant.parse(at)),
                account);
    }

    private void store(UUID account, NormalizedMessage... messages) {
        NormalizedConversation thread = new NormalizedConversation("secret-thread", ConversationType.THREAD, SUBJECT,
                null, List.of(ALICE), null);
        transactions.executeWithoutResult(t -> store.store(account, new SyncBatch(List.of(thread),
                List.of(messages), List.of(), new SyncCursor("next"), false)));
    }

    private static NormalizedMessage message(String id) {
        return new NormalizedMessage(id, "secret-thread", SENDER, MessageDirection.INBOUND, MessageType.TEXT, TEXT,
                MessageStatus.UNKNOWN, true, null, Instant.parse("2026-10-05T08:00:00Z"), List.of(), Map.of(), null,
                null);
    }

    private static RequestPostProcessor admin() {
        return user("admin@sino.test").roles("ADMIN");
    }

}
