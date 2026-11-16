package dev.sino.conversation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
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
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.sync.application.ImportResumer;

/**
 * F06 on the Gmail account connected on this machine (BE-57): run by hand with {@code ./mvnw test -Preal-gmail}, never
 * in CI, with the {@code local} profile ({@code .env}, the Compose database). Each test first syncs the account, so
 * mail sent to it a moment ago is there. Prints counts and times only, never mail content, subjects, names or
 * addresses.
 *
 * <p>Opening older mail reads it again from Gmail and keeps what it gave, as the web does: only a few messages a run,
 * the oldest first, so the rest stays to be opened from the web. Skipped while a backend answers on 8080: one backend
 * per database is assumed (F05 design), and that one would sync the account as well.
 */
@Tag("real-gmail")
// No automatic sync: only this test's syncs read the mailbox.
@SpringBootTest(properties = "sino.sync.live.scheduled=false")
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RealGmailMessagesTests {

    private static final int OLDER_MAIL_OPENED = 10;
    private static final int FILES_READ = 5;
    private static final long LARGEST_FILE_BYTES = 25L * 1024 * 1024;
    private static final Duration LONGEST_SYNC = Duration.ofMinutes(5);
    // What the cleaned HTML may never hold (D-120): scripts, event handlers, javascript: links.
    private static final Pattern UNSAFE = Pattern.compile("<script|\\son[a-z]+\\s*=|javascript:",
            Pattern.CASE_INSENSITIVE);
    private static final String OF_THE_ACCOUNT = """
            FROM message m JOIN conversation c ON c.id = m.conversation_id WHERE c.account_id = ?""";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    // An import left RUNNING goes on when the backend starts again; this process must not go on with it as well.
    @MockitoBean
    private ImportResumer resumer;

    @Test
    void readsEveryConversationAndOpensOlderMail() throws Exception {
        Account account = syncedGmailAccount();
        readsEveryConversation(account);
        opensOlderMail(account);
        showsCleanedHtml(account);
    }

    @Test
    void downloadsFilesAndShowsEmbeddedPictures() throws Exception {
        Account account = syncedGmailAccount();
        List<Map<String, Object>> parts = jdbc.queryForList("""
                SELECT a.id, a.message_id, m.conversation_id, a.size_bytes, a.content_id IS NOT NULL AS picture
                FROM attachment a JOIN message m ON m.id = a.message_id JOIN conversation c ON c.id = m.conversation_id
                WHERE c.account_id = ? ORDER BY a.size_bytes NULLS LAST, a.id
                """, account.id());
        List<Map<String, Object>> files = parts.stream().filter(part -> !(Boolean) part.get("picture")).toList();
        List<Map<String, Object>> pictures = parts.stream().filter(part -> (Boolean) part.get("picture")).toList();

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("files stored", files.size());
        report.put("... larger than 25 MB", files.stream().filter(RealGmailMessagesTests::tooLarge).count());
        report.put("embedded pictures stored", pictures.size());
        long slowest = 0;
        long bytes = 0;
        int read = 0;
        for (Map<String, Object> file : files.stream().filter(file -> !tooLarge(file)).limit(FILES_READ).toList()) {
            long started = System.nanoTime();
            MockHttpServletResponse response = download(account, file, false);
            slowest = Math.max(slowest, millisSince(started));
            assertThat(response.getStatus()).as("a file comes through Sino").isEqualTo(200);
            assertThat(response.getHeader("Content-Disposition")).startsWith("attachment");
            assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
            assertThat(response.getHeader("Content-Security-Policy")).isEqualTo("sandbox; default-src 'none'");
            assertSizeAsStored(response, file);
            bytes += response.getContentAsByteArray().length;
            read++;
        }
        report.put("files downloaded", read);
        report.put("... bytes in all", bytes);
        report.put("... slowest ms", slowest);
        for (Map<String, Object> file : files.stream().filter(RealGmailMessagesTests::tooLarge).limit(1).toList()) {
            assertThat(download(account, file, false).getStatus()).as("refused before Gmail is asked").isEqualTo(422);
            report.put("a file larger than 25 MB refused", true);
        }

        int shown = 0;
        int inHtml = 0;
        for (Map<String, Object> picture : pictures.stream().limit(FILES_READ).toList()) {
            MockHttpServletResponse response = download(account, picture, true);
            assertThat(response.getStatus()).as("an embedded picture comes through Sino").isEqualTo(200);
            assertThat(response.getContentType()).startsWith("image/");
            assertThat(response.getHeader("Content-Disposition")).startsWith("inline");
            assertThat(response.getHeader("Cache-Control")).isEqualTo("max-age=86400, private");
            assertSizeAsStored(response, picture);
            shown++;
            String html = JsonPath.read(json(get("/api/conversations/{id}/messages/{messageId}/body",
                    picture.get("conversation_id"), picture.get("message_id")), account), "$.html");
            if (html != null && html.contains("/attachments/" + picture.get("id") + "?inline=true")) {
                inHtml++;
            }
        }
        report.put("embedded pictures shown inline", shown);
        report.put("... that the cleaned HTML points at", inHtml);
        print("files and embedded pictures", report);

        assertThat(inHtml).as("each picture shown is one its HTML shows").isEqualTo(shown);
        assumeFalse(files.isEmpty() && pictures.isEmpty(),
                "No file and no embedded picture in this mailbox: send it a mail with a file and a picture inline");
    }

    private void readsEveryConversation(Account account) throws Exception {
        List<UUID> conversations = jdbc.queryForList("SELECT id FROM conversation WHERE account_id = ?", UUID.class,
                account.id());
        long listed = 0;
        long pages = 0;
        long slowest = 0;
        long toUnknown = 0;
        long withFiles = 0;
        for (UUID conversation : conversations) {
            Set<String> seen = new HashSet<>();
            String cursor = null;
            do {
                MockHttpServletRequestBuilder page = get("/api/conversations/{id}/messages", conversation)
                        .param("limit", "20");
                if (cursor != null) {
                    page.param("cursor", cursor);
                }
                long started = System.nanoTime();
                Map<String, Object> body = json(page, account);
                slowest = Math.max(slowest, millisSince(started));
                pages++;
                List<String> ids = JsonPath.read(body, "$.items[*].id");
                assertThat(ids).as("a message is listed once").allMatch(seen::add);
                List<Object> to = JsonPath.read(body, "$.items[*].to");
                toUnknown += to.stream().filter(Objects::isNull).count();
                List<List<Object>> files = JsonPath.read(body, "$.items[*].attachments");
                withFiles += files.stream().filter(list -> !list.isEmpty()).count();
                cursor = (String) body.get("nextCursor");
            } while (cursor != null);
            // A thread found in several accounts lists the messages of every copy in the inbox, each Message-ID once
            // (F05b, D-184).
            assertThat((long) seen.size()).as("every message of a conversation, page after page")
                    .isEqualTo(jdbc.queryForObject("""
                            SELECT count(DISTINCT COALESCE('rfc:' || NULLIF(m.metadata ->> 'rfcMessageId', ''),
                                                           'id:' || m.id))
                            FROM message m JOIN conversation c ON c.id = m.conversation_id
                            JOIN connected_account a ON a.id = c.account_id
                            WHERE c.thread_group_id = (SELECT thread_group_id FROM conversation WHERE id = ?)
                              AND a.removed_at IS NULL AND a.status <> 'DISABLED'
                            """, Long.class, conversation));
            listed += seen.size();
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("conversations", conversations.size());
        report.put("messages listed (= stored, each Message-ID of a thread once)", listed);
        report.put("pages of 20", pages);
        report.put("slowest page ms", slowest);
        report.put("messages whose addressees Sino does not know (stored before BE-54)", toUnknown);
        report.put("messages with files", withFiles);
        print("every conversation, message by message", report);
    }

    // Mail with its HTML, stored so or read again just now: what the web gets is cleaned.
    private void showsCleanedHtml(Account account) throws Exception {
        List<Map<String, Object>> stored = jdbc.queryForList("SELECT m.id, m.conversation_id " + OF_THE_ACCOUNT
                + " AND m.body_format = 'HTML' ORDER BY m.sent_at DESC LIMIT 30", account.id());
        long remoteImages = 0;
        for (Map<String, Object> message : stored) {
            Map<String, Object> body = json(get("/api/conversations/{id}/messages/{messageId}/body",
                    message.get("conversation_id"), message.get("id")), account);
            assertThat(body.get("format")).isEqualTo("HTML");
            assertThat(UNSAFE.matcher((String) body.get("html")).find()).as("nothing that runs is left").isFalse();
            if (Boolean.TRUE.equals(body.get("remoteImages"))) {
                remoteImages++;
            }
        }
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("HTML mail opened", stored.size());
        report.put("... with pictures from the web (shown only when the user asks)", remoteImages);
        print("mail stored with its HTML", report);
    }

    // Mail stored before Sino kept HTML is read again from Gmail the first time it is opened (D-122).
    private void opensOlderMail(Account account) throws Exception {
        List<Map<String, Object>> older = jdbc.queryForList("SELECT m.id, m.conversation_id " + OF_THE_ACCOUNT
                + " AND m.body_format = 'UNCHECKED' ORDER BY m.sent_at, m.id LIMIT " + OLDER_MAIL_OPENED,
                account.id());
        long filesBefore = filesOf(account);
        List<Long> first = new ArrayList<>();
        List<Long> again = new ArrayList<>();
        Map<String, Long> formats = new LinkedHashMap<>();
        for (Map<String, Object> message : older) {
            MockHttpServletRequestBuilder body = get("/api/conversations/{id}/messages/{messageId}/body",
                    message.get("conversation_id"), message.get("id"));
            long started = System.nanoTime();
            Map<String, Object> opened = json(body, account);
            first.add(millisSince(started));
            started = System.nanoTime();
            Map<String, Object> openedAgain = json(body, account);
            again.add(millisSince(started));
            assertThat(openedAgain.get("format")).as("kept after the first time").isEqualTo(opened.get("format"));
            formats.merge((String) opened.get("format"), 1L, Long::sum);
            if ("HTML".equals(opened.get("format"))) {
                assertThat(UNSAFE.matcher((String) opened.get("html")).find()).isFalse();
            }
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("older mail opened (oldest first)", older.size());
        report.put("... became", formats);
        report.put("... first open ms (median, slowest)", median(first) + ", " + slowest(first));
        report.put("... second open ms (median, slowest)", median(again) + ", " + slowest(again));
        report.put("... whose addressees Sino now knows", older.isEmpty() ? 0 : jdbc.queryForObject(
                "SELECT count(*) FROM message WHERE recipients IS NOT NULL AND id IN (" + String.join(",",
                        older.stream().map(message -> "'" + message.get("id") + "'").toList()) + ")", Long.class));
        report.put("files and embedded pictures added by reading again", filesOf(account) - filesBefore);
        report.put("older mail left to open from the web", jdbc.queryForObject("SELECT count(*) " + OF_THE_ACCOUNT
                + " AND m.body_format = 'UNCHECKED'", Long.class, account.id()));
        print("older mail read again", report);

        for (Map<String, Object> message : older) {
            assertThat(jdbc.queryForObject("SELECT body_format FROM message WHERE id = ?", String.class,
                    message.get("id"))).as("each one opened is read again once").isNotEqualTo("UNCHECKED");
        }
    }

    private long filesOf(Account account) {
        return jdbc.queryForObject("SELECT count(*) FROM attachment a JOIN message m ON m.id = a.message_id"
                + " JOIN conversation c ON c.id = m.conversation_id WHERE c.account_id = ?", Long.class, account.id());
    }

    private MockHttpServletResponse download(Account account, Map<String, Object> part, boolean inline)
            throws Exception {
        MockHttpServletRequestBuilder request = get(
                "/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}", part.get("conversation_id"),
                part.get("message_id"), part.get("id"));
        if (inline) {
            request.param("inline", "true");
        }
        return mvc.perform(request.with(user(account.owner()))).andReturn().getResponse();
    }

    private static void assertSizeAsStored(MockHttpServletResponse response, Map<String, Object> part) {
        if (part.get("size_bytes") != null) {
            assertThat((long) response.getContentAsByteArray().length).as("the size Gmail gave at import")
                    .isEqualTo(((Number) part.get("size_bytes")).longValue());
        }
    }

    private static boolean tooLarge(Map<String, Object> part) {
        return part.get("size_bytes") != null && ((Number) part.get("size_bytes")).longValue() > LARGEST_FILE_BYTES;
    }

    // Syncs the account now, as "Đồng bộ ngay" does, and waits for the sync to end.
    private Account syncedGmailAccount() throws Exception {
        assumeFalse(somethingAnswersOn8080(), "Stop the backend on port 8080 first: it would sync the account too");
        List<Account> accounts = jdbc.query("""
                SELECT a.id, u.email FROM connected_account a JOIN app_user u ON u.id = a.user_id
                JOIN sync_checkpoint s ON s.account_id = a.id
                WHERE a.provider = 'gmail' AND a.removed_at IS NULL AND a.status NOT IN ('AUTH_EXPIRED', 'DISABLED')
                  AND s.import_status = 'DONE'
                ORDER BY a.updated_at DESC
                """, (row, n) -> new Account(row.getObject("id", UUID.class), row.getString("email")));
        assumeFalse(accounts.isEmpty(), "Connect a Gmail account and import it from the web first (README, Gmail)");
        Account account = accounts.getFirst();
        long before = jdbc.queryForObject("SELECT count(*) " + OF_THE_ACCOUNT, Long.class, account.id());
        Object synced = lastSyncOf(account);

        long started = System.nanoTime();
        mvc.perform(post("/api/accounts/{id}/sync", account.id()).with(csrf()).with(user(account.owner())))
                .andExpect(status().isAccepted());
        Map<String, Object> sync = awaitSync(account, synced);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("seconds", Math.round(millisSince(started) / 1000.0));
        report.put("new messages", jdbc.queryForObject("SELECT count(*) " + OF_THE_ACCOUNT, Long.class, account.id())
                - before);
        report.put("error", sync.get("lastError"));
        print("sync of the connected account", report);
        assertThat(sync.get("lastError")).as("the sync ends well").isNull();
        return account;
    }

    // Only a sync that ends well moves last_sync_at; one that fails leaves its error code.
    private Map<String, Object> awaitSync(Account account, Object synced) throws Exception {
        long deadline = System.nanoTime() + LONGEST_SYNC.toNanos();
        while (Objects.equals(synced, lastSyncOf(account))) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("No sync of " + account.id() + " ended well within " + LONGEST_SYNC
                        + "; last error: " + json(get("/api/accounts/{id}/sync", account.id()), account)
                                .get("lastError"));
            }
            Thread.sleep(500);
        }
        return json(get("/api/accounts/{id}/sync", account.id()), account);
    }

    private Object lastSyncOf(Account account) {
        return jdbc.queryForObject("SELECT last_sync_at FROM sync_checkpoint WHERE account_id = ?", Object.class,
                account.id());
    }

    private Map<String, Object> json(MockHttpServletRequestBuilder request, Account account) throws Exception {
        String body = mvc.perform(request.with(user(account.owner()))).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString();
        return JsonPath.read(body, "$");
    }

    private static long millisSince(long started) {
        return Duration.ofNanos(System.nanoTime() - started).toMillis();
    }

    private static long median(List<Long> millis) {
        return millis.isEmpty() ? 0 : millis.stream().sorted().toList().get(millis.size() / 2);
    }

    private static long slowest(List<Long> millis) {
        return millis.stream().mapToLong(Long::longValue).max().orElse(0);
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

    private record Account(UUID id, String owner) {
    }

}
