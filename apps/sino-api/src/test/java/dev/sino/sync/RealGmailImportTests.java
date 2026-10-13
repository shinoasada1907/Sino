package dev.sino.sync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.conversation.ConversationStore;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.sync.application.ImportResumer;
import dev.sino.sync.application.InitialSyncProperties;

/**
 * The first import with the Gmail account connected on this machine (BE-46, D-58): run by hand with
 * {@code ./mvnw test -Preal-gmail}, never in CI, with the {@code local} profile ({@code .env}, the Compose database).
 * Imports the account's range again, measures how fast, and checks that the inbox API says what the database holds.
 * Prints counts and times only, never mail content, subjects or addresses.
 *
 * <p>Reading the range again stores nothing twice, but it is a new import: the status counts start from 0, the last
 * sync is cleared until the next one, and the provider is asked to watch the mailbox again. Skipped while a backend
 * answers on 8080: one backend per database is assumed (F05 design), and that one would read the account as well,
 * for a Gmail notice or a due sync. Skipped too without a Gmail account that was imported before.
 */
@Tag("real-gmail")
// No automatic sync: only this test's import reads the mailbox, so the speed is its own.
@SpringBootTest(properties = "sino.sync.live.scheduled=false")
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RealGmailImportTests {

    private static final Duration LONGEST_IMPORT = Duration.ofMinutes(30);
    private static final String IN_THE_INBOX = """
            c.account_id IN (SELECT a.id FROM connected_account a
                             WHERE a.user_id = ? AND a.removed_at IS NULL AND a.status <> 'DISABLED')
            AND NOT c.archived""";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private InitialSyncProperties speeds;

    @MockitoSpyBean
    private ConversationStore store;

    // An import left RUNNING goes on when the backend starts again; this process, about to skip, would stop it halfway.
    @MockitoBean
    private ImportResumer resumer;

    @Test
    void importsTheRangeAgainAndTheInboxShowsWhatIsStored() throws Exception {
        assumeFalse(somethingAnswersOn8080(), "Stop the backend on port 8080 first: it would read the account too");
        Account account = importedGmailAccount();
        AtomicLong read = new AtomicLong();
        // The transaction proxy wraps the spy: stub the spy itself, or the stubbing call would need a transaction.
        ConversationStore spy = AopTestUtils.getUltimateTargetObject(store);
        doAnswer(call -> {
            read.addAndGet(call.getArgument(1, SyncBatch.class).messages().size());
            return call.callRealMethod();
        }).when(spy).store(any(), any());

        long started = System.nanoTime();
        mvc.perform(post("/api/accounts/{id}/initial-sync", account.id()).with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"range\":\"" + account.range() + "\"}").with(user(account.owner())))
                .andExpect(status().isAccepted());
        awaitEnd(account.id());
        Duration took = Duration.ofNanos(System.nanoTime() - started);
        Map<String, Object> end = json(get("/api/accounts/{id}/initial-sync", account.id()), account);

        double minutes = took.toMillis() / 60_000.0;
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("range", account.range());
        report.put("status", end.get("status") + (end.get("errorCode") == null ? "" : " " + end.get("errorCode")));
        report.put("estimated", end.get("estimated"));
        report.put("messages read", read.get());
        report.put("messages new or changed", end.get("imported"));
        report.put("skipped", end.get("skipped"));
        report.put("seconds", Math.round(took.toMillis() / 1000.0));
        report.put("messages read per minute", Math.round(read.get() / minutes));
        report.put("speeds assumed per minute (slow, fast)", speeds.slowMessagesPerMinute() + ", "
                + speeds.fastMessagesPerMinute());
        print("import of the connected account again", report);

        assertThat(end.get("status")).isEqualTo("DONE");
        assertThat(end.get("errorCode")).isNull();
        assertThat(((Number) end.get("storedMessages")).longValue()).as("stored messages, API against database")
                .isEqualTo(jdbc.queryForObject("SELECT count(*) FROM message m JOIN conversation c"
                        + " ON c.id = m.conversation_id WHERE c.account_id = ?", Long.class, account.id()));
        assertThat(summariesNotMatchingTheirMessages(account.id())).as("conversations whose summary disagrees")
                .isZero();
        assertTheInboxShowsTheDatabase(account);
    }

    private void assertTheInboxShowsTheDatabase(Account account) throws Exception {
        Map<String, Object> database = jdbc.queryForMap("""
                SELECT count(*) AS conversations,
                       count(*) FILTER (WHERE c.unread_count > 0) AS unread,
                       count(*) FILTER (WHERE c.needs_reply) AS needs_reply,
                       count(*) FILTER (WHERE c.has_attachments) AS with_attachments
                FROM conversation c WHERE\s""" + IN_THE_INBOX, account.ownerId());
        Map<String, Object> counts = json(get("/api/conversations/counts"), account);
        List<String> listed = conversationIds("all", account);
        List<String> unread = conversationIds("unread", account);
        List<String> reply = conversationIds("reply", account);
        List<String> withFiles = conversationIds("attachments", account);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("conversations (database / API list)", database.get("conversations") + " / " + listed.size());
        report.put("unread (database / counts / unread list)", database.get("unread") + " / " + counts.get("unread")
                + " / " + unread.size());
        report.put("needs reply (database / counts / reply list)", database.get("needs_reply") + " / "
                + counts.get("needsReply") + " / " + reply.size());
        report.put("with files (database / counts / attachments list)", database.get("with_attachments") + " / "
                + counts.get("withAttachments") + " / " + withFiles.size());
        print("inbox: database against the API", report);

        assertThat(listed).as("each conversation listed once").doesNotHaveDuplicates()
                .hasSize(((Number) database.get("conversations")).intValue());
        assertThat(((Number) counts.get("unread")).longValue()).isEqualTo(database.get("unread"))
                .isEqualTo(unread.size());
        assertThat(((Number) counts.get("needsReply")).longValue()).isEqualTo(database.get("needs_reply"))
                .isEqualTo(reply.size());
        assertThat(((Number) counts.get("withAttachments")).longValue()).isEqualTo(database.get("with_attachments"))
                .isEqualTo(withFiles.size());
    }

    // Worked out from the messages themselves, not from the code that keeps the summaries (BE-43). Needs a reply: the
    // newest message came in and is not bulk (D-68).
    private long summariesNotMatchingTheirMessages(UUID accountId) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM conversation c
                LEFT JOIN LATERAL (
                    SELECT m.direction = 'INBOUND' AND coalesce(m.metadata ->> 'bulk', '') <> 'true' AS needs_reply
                    FROM message m WHERE m.conversation_id = c.id ORDER BY m.sent_at DESC, m.id DESC LIMIT 1
                ) latest ON true
                WHERE c.account_id = ?
                  AND (c.unread_count, c.last_message_at, c.has_attachments, c.needs_reply) IS DISTINCT FROM (
                      (SELECT count(*) FILTER (WHERE NOT m.is_read) FROM message m WHERE m.conversation_id = c.id),
                      (SELECT max(m.sent_at) FROM message m WHERE m.conversation_id = c.id),
                      EXISTS (SELECT 1 FROM attachment a JOIN message m ON m.id = a.message_id
                              WHERE m.conversation_id = c.id AND a.content_id IS NULL),
                      coalesce(latest.needs_reply, false))
                """, Long.class, accountId);
    }

    // Every page of a view, the way the web scrolls through it.
    private List<String> conversationIds(String view, Account account) throws Exception {
        Set<String> seen = new HashSet<>();
        List<String> ids = new ArrayList<>();
        String cursor = null;
        do {
            MockHttpServletRequestBuilder page = get("/api/conversations").param("view", view).param("limit", "100");
            if (cursor != null) {
                page.param("cursor", cursor);
            }
            Map<String, Object> body = json(page, account);
            List<String> items = JsonPath.read(body, "$.items[*].id");
            ids.addAll(items);
            cursor = (String) body.get("nextCursor");
            assertThat(cursor == null || seen.add(cursor)).as("a cursor never comes back").isTrue();
        } while (cursor != null);
        return ids;
    }

    private Map<String, Object> json(MockHttpServletRequestBuilder request, Account account) throws Exception {
        String body = mvc.perform(request.with(user(account.owner()))).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString();
        return JsonPath.read(body, "$");
    }

    private void awaitEnd(UUID accountId) throws InterruptedException {
        long deadline = System.nanoTime() + LONGEST_IMPORT.toNanos();
        while ("RUNNING".equals(jdbc.queryForObject("SELECT import_status FROM sync_checkpoint WHERE account_id = ?",
                String.class, accountId))) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("The import of " + accountId + " still runs after " + LONGEST_IMPORT
                        + "; restarting the backend goes on with it");
            }
            Thread.sleep(1000);
        }
    }

    // The account's own range again, so the import does not change what the user chose.
    private Account importedGmailAccount() {
        List<Account> accounts = jdbc.query("""
                SELECT a.id, a.user_id, u.email, s.import_status, s.import_range AS range
                FROM connected_account a JOIN app_user u ON u.id = a.user_id
                JOIN sync_checkpoint s ON s.account_id = a.id
                WHERE a.provider = 'gmail' AND a.removed_at IS NULL AND a.status NOT IN ('AUTH_EXPIRED', 'DISABLED')
                ORDER BY a.updated_at DESC
                """, (row, n) -> new Account(row.getObject("id", UUID.class), row.getObject("user_id", UUID.class),
                row.getString("email"), row.getString("range"), "RUNNING".equals(row.getString("import_status"))));
        assumeFalse(accounts.isEmpty(), "Connect a Gmail account and import it from the web first (README, Gmail)");
        Account account = accounts.getFirst();
        assumeFalse(account.importRunning(), "An import of this account runs: wait until it is done");
        return account;
    }

    private static boolean somethingAnswersOn8080() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("localhost", 8080), 500);
            return true;
        } catch (IOException nothing) {
            return false;
        }
    }

    private static void print(String title, Map<String, Object> counts) {
        System.out.println("[real-gmail] " + title);
        counts.forEach((name, value) -> System.out.println("[real-gmail]   " + name + ": " + value));
    }

    private record Account(UUID id, UUID ownerId, String owner, String range, boolean importRunning) {
    }

}
