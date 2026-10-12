package dev.sino.provider.infrastructure.gmail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.account.ProviderAccess;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.sync.application.ImportResumer;

/**
 * F10 on the Gmail account connected on this machine (BE-60). It sends one real reply, so it runs only by hand and
 * only when told where to: {@code ./mvnw test -Preal-gmail -Dtest=RealGmailReplyTests
 * -Dsino.real-gmail.reply.conversation=<conversation id> -Dsino.real-gmail.reply.to=<its one addressee>}. Nothing is
 * sent unless the conversation answers to exactly that address. A second run sends nothing: it asks again with the
 * {@code clientMessageId} of the reply already in the conversation. Prints counts and times only, never mail content,
 * subjects or addresses. Skipped while a backend answers on 8080, which would sync the account as well.
 */
@Tag("real-gmail")
// No automatic sync: only this test's syncs read the mailbox.
@SpringBootTest(properties = "sino.sync.live.scheduled=false")
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RealGmailReplyTests {

    private static final String TEXT = "Thư thử của Sino (BE-60): trả lời từ Sino vào đúng thread. Có thể bỏ qua thư này.";
    private static final Duration LONGEST_SYNC = Duration.ofMinutes(5);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ProviderAccess access;

    @Autowired
    private ObjectProvider<GmailProperties> gmail;

    // An import left RUNNING goes on when the backend starts again; this process must not go on with it as well.
    @MockitoBean
    private ImportResumer resumer;

    @Test
    void repliesOnceInTheThreadOfTheConversation() throws Exception {
        assumeFalse(somethingAnswersOn8080(), "Stop the backend on port 8080 first: it would sync the account too");
        String picked = System.getProperty("sino.real-gmail.reply.conversation");
        String addressee = System.getProperty("sino.real-gmail.reply.to");
        assumeTrue(picked != null && addressee != null, "Pick the conversation and its one addressee: "
                + "-Dsino.real-gmail.reply.conversation=<id> -Dsino.real-gmail.reply.to=<address>");
        UUID conversation = UUID.fromString(picked);
        Target target = target(conversation);
        GmailApi api = gmailApi();
        sync(target);

        Map<String, Object> detail = json(get("/api/conversations/{id}", conversation), target);
        assertThat(JsonPath.<String>read(detail, "$.reply.state")).as("Sino may reply here").isEqualTo("READY");
        List<String> to = JsonPath.read(detail, "$.reply.to[*].address");
        assertThat(to.stream().map(address -> address.toLowerCase(Locale.ROOT)).toList())
                .as("the reply goes only to the address picked for it")
                .containsExactly(addressee.strip().toLowerCase(Locale.ROOT));

        Optional<UUID> earlier = jdbc.query("""
                SELECT client_message_id FROM message WHERE conversation_id = ? AND client_message_id IS NOT NULL
                ORDER BY sent_at DESC LIMIT 1
                """, (row, n) -> row.getObject(1, UUID.class), conversation).stream().findFirst();
        UUID clientMessageId = earlier.orElseGet(UUID::randomUUID);
        long started = System.nanoTime();
        MockHttpServletResponse first = send(conversation, clientMessageId, target);
        long sendMillis = millisSince(started);
        MockHttpServletResponse again = send(conversation, clientMessageId, target);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("run", earlier.isPresent() ? "again, with the reply already sent" : "first");
        report.put("first request: status, ms", first.getStatus() + ", " + sendMillis);
        report.put("same clientMessageId again: status", again.getStatus());
        assertThat(first.getStatus()).as("sent now, or found already sent").isEqualTo(earlier.isPresent() ? 200 : 201);
        String messageId = JsonPath.read(first.getContentAsString(), "$.id");
        assertThat(JsonPath.<String>read(first.getContentAsString(), "$.status")).isEqualTo("SENT");
        assertThat(again.getStatus()).as("the same clientMessageId sends nothing").isEqualTo(200);
        assertThat(JsonPath.<String>read(again.getContentAsString(), "$.id")).isEqualTo(messageId);
        Map<String, Object> row = jdbc.queryForMap("""
                SELECT external_message_id, text_content, reply_to_external_message_id, created_at FROM message
                WHERE id = ?
                """, UUID.fromString(messageId));
        String externalId = (String) row.get("external_message_id");
        // created_at is when the first send of this clientMessageId started; a sync later moves sent_at to Gmail's.
        Instant startedAt = ((Timestamp) row.get("created_at")).toInstant();
        SendMessageCommand sent = new SendMessageCommand(target.thread(), (String) row.get("text_content"),
                (String) row.get("reply_to_external_message_id"), List.of(new Address(null, addressee)),
                clientMessageId);

        Seen seen = access.call(target.account(), (connector, context) -> {
            String token = ((OAuth2Credentials) context.credentials()).accessToken();
            List<GmailMessage> thread = api.thread(token, target.thread());
            GmailMessage message = thread.stream().filter(each -> each.id().equals(externalId)).findFirst()
                    .orElseThrow(() -> new AssertionError("The reply is not in the thread of the conversation"));
            long sameText = thread.stream().filter(each -> each.labelIds().contains("SENT"))
                    .filter(each -> GmailMessageNormalizer.asSent(sent.textContent())
                            .equals(GmailMessageNormalizer.text(each)))
                    .count();
            return new Seen(GmailProvider.sentLike(thread, sent, startedAt).stream().map(GmailMessage::id).toList(),
                    sameText, connector.findSentMessages(context, sent, startedAt), message.threadId(),
                    message.labelIds(),
                    message.payload() == null ? Optional.empty() : message.payload().header("Subject"));
        });
        report.put("messages Gmail sent in the thread with this text since the send started", seen.sentSince());
        report.put("... at any time (an earlier one is not taken for it)", seen.sentEver());
        report.put("findSentMessages finds it first", !seen.found().isEmpty()
                && seen.found().getFirst().equals(externalId));
        report.put("in the thread of the conversation", target.thread().equals(seen.threadId()));
        report.put("labelled SENT", seen.labels().contains("SENT"));
        report.put("subject starts with Re:",
                seen.subject().map(subject -> subject.regionMatches(true, 0, "Re:", 0, 3)));

        sync(target);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT m.conversation_id, m.status, m.client_message_id FROM message m
                JOIN conversation c ON c.id = m.conversation_id
                WHERE c.account_id = ? AND m.external_message_id = ?
                """, target.account(), externalId);
        boolean latest = externalId.equals(jdbc.queryForObject("""
                SELECT external_message_id FROM message WHERE conversation_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1
                """, String.class, conversation));
        Map<String, Object> after = json(get("/api/conversations/{id}", conversation), target);
        report.put("rows for the message after a sync", rows.size());
        report.put("the reply is the latest message; conversation needs a reply",
                latest + "; " + after.get("needsReply"));
        print("one reply through Gmail", report);

        assertThat(seen.sentSince()).as("one message in Gmail for one clientMessageId").containsExactly(externalId);
        assertThat(seen.found()).as("how Sino settles an unknown outcome finds it (D-132)").containsExactly(externalId);
        assertThat(seen.threadId()).as("in the thread of the conversation").isEqualTo(target.thread());
        assertThat(seen.labels()).contains("SENT");
        assertThat(rows).as("the sync brings it back as the same message").singleElement().satisfies(stored -> {
            assertThat(stored.get("conversation_id")).isEqualTo(conversation);
            assertThat(stored.get("status")).isEqualTo("SENT");
            assertThat(stored.get("client_message_id")).isEqualTo(clientMessageId);
        });
        if (latest) {
            assertThat(after.get("needsReply")).as("answered").isEqualTo(false);
        }
    }

    private Target target(UUID conversation) {
        List<Target> found = jdbc.query("""
                SELECT c.account_id, u.email, c.external_conversation_id FROM conversation c
                JOIN connected_account a ON a.id = c.account_id JOIN app_user u ON u.id = a.user_id
                WHERE c.id = ? AND a.provider = 'gmail' AND a.removed_at IS NULL
                """, (row, n) -> new Target(row.getObject("account_id", UUID.class), row.getString("email"),
                row.getString("external_conversation_id")), conversation);
        assumeFalse(found.isEmpty(), "No conversation " + conversation + " of a connected Gmail account");
        return found.getFirst();
    }

    private MockHttpServletResponse send(UUID conversation, UUID clientMessageId, Target target) throws Exception {
        return mvc.perform(post("/api/conversations/{id}/messages", conversation).with(csrf())
                .with(user(target.owner())).contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"" + TEXT + "\",\"clientMessageId\":\"" + clientMessageId + "\"}"))
                .andReturn().getResponse();
    }

    // Syncs the account now, as "Đồng bộ ngay" does, and waits for the sync to end well.
    private void sync(Target target) throws Exception {
        Object synced = lastSyncOf(target);
        mvc.perform(post("/api/accounts/{id}/sync", target.account()).with(csrf()).with(user(target.owner())))
                .andExpect(status().isAccepted());
        long deadline = System.nanoTime() + LONGEST_SYNC.toNanos();
        while (Objects.equals(synced, lastSyncOf(target))) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("No sync of " + target.account() + " ended well within " + LONGEST_SYNC
                        + "; last error: " + json(get("/api/accounts/{id}/sync", target.account()), target)
                                .get("lastError"));
            }
            sleep(Duration.ofMillis(500));
        }
    }

    private Object lastSyncOf(Target target) {
        return jdbc.queryForObject("SELECT last_sync_at FROM sync_checkpoint WHERE account_id = ?", Object.class,
                target.account());
    }

    private Map<String, Object> json(MockHttpServletRequestBuilder request, Target target) throws Exception {
        String body = mvc.perform(request.with(user(target.owner()))).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString();
        return JsonPath.read(body, "$");
    }

    private GmailApi gmailApi() {
        GmailProperties properties = gmailProperties();
        return new GmailApi(properties.userInfoUri(), properties.gmailApiUri(), GmailProvider.CONNECT_TIMEOUT,
                GmailProvider.READ_TIMEOUT, GmailProvider.FILE_READ_TIMEOUT, GmailProvider.SEND_TIMEOUT);
    }

    private GmailProperties gmailProperties() {
        GmailProperties properties = gmail.getIfAvailable();
        assumeTrue(properties != null, "Gmail is off: set the Google client in .env");
        return properties;
    }

    private static void sleep(Duration duration) {
        try {
            Thread.sleep(duration);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }

    private static long millisSince(long started) {
        return Duration.ofNanos(System.nanoTime() - started).toMillis();
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

    private record Target(UUID account, String owner, String thread) {
    }

    private record Seen(List<String> sentSince, long sentEver, List<String> found, String threadId,
            List<String> labels, Optional<String> subject) {
    }

}
