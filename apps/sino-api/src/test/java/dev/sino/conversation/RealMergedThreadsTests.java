package dev.sino.conversation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.conversation.infrastructure.ThreadGroups;
import dev.sino.sync.application.ImportResumer;

/**
 * F05b on the Gmail accounts connected on this machine (BE-83): run by hand with {@code ./mvnw test -Preal-gmail},
 * never in CI, with the {@code local} profile ({@code .env}, the Compose database). It reads what Sino stored and
 * never asks Gmail nor sends anything: a thread found in several accounts is one row of the inbox, its messages are
 * each there once, and a change reaches every copy. The one change it makes, archiving a group and marking it unread,
 * it undoes, and only on a group that is neither archived nor unread. Prints counts and times only, never mail
 * content, subjects, names or addresses. Skipped while a backend answers on 8080: one backend per database.
 */
@Tag("real-gmail")
// No automatic sync: the mail must not change while the test reads it.
@SpringBootTest(properties = "sino.sync.live.scheduled=false")
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RealMergedThreadsTests {

    // The accounts the inbox shows (D-66), as InboxService picks them.
    private static final String IN_THE_INBOX = """
            JOIN connected_account a ON a.id = c.account_id
            WHERE a.user_id = ? AND a.removed_at IS NULL AND a.status <> 'DISABLED'""";
    private static final String KEY = "COALESCE('rfc:' || NULLIF(m.metadata ->> 'rfcMessageId', ''), 'id:' || m.id)";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ThreadGroups groups;

    // An import left RUNNING goes on when the backend starts again; this process must not go on with it as well.
    @MockitoBean
    private ImportResumer resumer;

    private UUID owner;
    private String email;

    @BeforeEach
    void theOwnerOfTheConnectedAccounts() {
        assumeFalse(somethingAnswersOn8080(), "Stop the backend on port 8080 first: one backend per database");
        List<Map<String, Object>> owners = jdbc.queryForList("""
                SELECT u.id, u.email, count(*) AS accounts FROM app_user u JOIN connected_account a ON a.user_id = u.id
                WHERE a.provider = 'gmail' AND a.removed_at IS NULL GROUP BY u.id, u.email ORDER BY 3 DESC
                """);
        assumeFalse(owners.isEmpty() || ((Number) owners.getFirst().get("accounts")).intValue() < 2,
                "Connect two Gmail accounts that mail each other and import them from the web first");
        owner = (UUID) owners.getFirst().get("id");
        email = (String) owners.getFirst().get("email");
    }

    // BE-80 on the real data: grouping again, as each start does, changes nothing; each group is made of copies in
    // different accounts that share a Message-ID.
    @Test
    void theGroupsAreThereAndGroupingAgainChangesNothing() {
        List<Map<String, Object>> before = jdbc.queryForList("SELECT id, grouped_with FROM conversation ORDER BY id");
        long started = System.nanoTime();
        groups.groupAll();
        long groupingMillis = millisSince(started);
        assertThat(jdbc.queryForList("SELECT id, grouped_with FROM conversation ORDER BY id"))
                .as("grouping again at start changes nothing").isEqualTo(before);

        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM (SELECT thread_group_id FROM conversation GROUP BY 1
                                      HAVING count(DISTINCT account_id) < count(*)) twice
                """, Long.class)).as("no group holds two copies in one account").isZero();
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM conversation c
                WHERE c.thread_group_id IN (SELECT thread_group_id FROM conversation GROUP BY 1 HAVING count(*) > 1)
                  AND NOT EXISTS (
                    SELECT 1 FROM message m
                    JOIN message o ON o.metadata ->> 'rfcMessageId' = m.metadata ->> 'rfcMessageId'
                    JOIN conversation oc ON oc.id = o.conversation_id
                    WHERE m.conversation_id = c.id AND oc.thread_group_id = c.thread_group_id AND oc.id <> c.id
                      AND m.metadata ->> 'rfcMessageId' <> '')
                """, Long.class)).as("each copy of a group shares a Message-ID with another one").isZero();

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("conversations", before.size());
        report.put("groups", jdbc.queryForObject("SELECT count(DISTINCT thread_group_id) FROM conversation",
                Long.class));
        report.put("groups of several copies", multiCopyGroups().size());
        report.put("messages with an empty Message-ID", jdbc.queryForObject(
                "SELECT count(*) FROM message WHERE metadata ->> 'rfcMessageId' = ''", Long.class));
        report.put("grouping again (ms)", groupingMillis);
        print("groups", report);
    }

    // BE-81: one row a group, the ID of its oldest copy in the inbox, every account named; any copy opens it; the
    // counts are the lengths of their lists.
    @Test
    void eachGroupIsOneRowOfTheInbox() throws Exception {
        Pages all = everyRow("all");
        Pages archived = everyRow("archived");
        Map<UUID, Map<String, Object>> rows = new HashMap<>();
        for (Map<String, Object> row : all.rows()) {
            assertThat(rows.put(UUID.fromString((String) row.get("id")), row)).as("a row is listed once").isNull();
        }
        assertThat((long) all.rows().size()).as("one row a group that is not archived")
                .isEqualTo(groupsOf("HAVING NOT bool_and(c.archived)"));
        assertThat((long) archived.rows().size()).as("one row a group archived in every copy")
                .isEqualTo(groupsOf("HAVING bool_and(c.archived)"));

        List<List<UUID>> merged = multiCopyGroups();
        long slowestOpen = 0;
        for (List<UUID> copies : merged) {
            UUID group = copies.getFirst();
            Map<String, Object> row = rows.get(group);
            assertThat(row).as("the row of a group has the ID of its oldest copy").isNotNull();
            assertThat(accountIdsOf(row)).as("every account of the group, each once").hasSize(copies.size())
                    .doesNotHaveDuplicates();
            for (UUID copy : copies) {
                long started = System.nanoTime();
                Map<String, Object> opened = json(get("/api/conversations/{id}", copy));
                slowestOpen = Math.max(slowestOpen, millisSince(started));
                assertThat(opened.get("id")).as("any copy opens the group").isEqualTo(group.toString());
            }
        }

        Map<String, Object> counts = json(get("/api/conversations/counts"));
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("rows", all.rows().size());
        report.put("archived rows", archived.rows().size());
        report.put("rows of several accounts", all.rows().stream().filter(row -> accountIdsOf(row).size() > 1).count());
        // Each count against the view that lists the same rows.
        for (Map.Entry<String, String> view : Map.of("unread", "unread", "needsReply", "reply", "withAttachments",
                "attachments").entrySet()) {
            long listed = everyRow(view.getValue()).rows().size();
            assertThat(((Number) counts.get(view.getKey())).longValue()).as(view.getKey() + ": the rows of its view")
                    .isEqualTo(listed);
            report.put(view.getKey(), counts.get(view.getKey()));
        }
        report.put("slowest page of the inbox (ms)", all.slowestMillis());
        report.put("slowest open of a group (ms)", slowestOpen);
        print("inbox by group", report);
    }

    // BE-82, D-184 = B: the messages of a group, each Message-ID once, from the copy it went from, else the oldest.
    @Test
    void theMessagesOfAGroupAreEachThereOnce() throws Exception {
        long stored = 0;
        long shown = 0;
        long slowest = 0;
        for (List<UUID> copies : multiCopyGroups()) {
            Map<String, UUID> expected = expectedMessages(copies);
            List<String> listed = new ArrayList<>();
            String cursor = null;
            do {
                MockHttpServletRequestBuilder page = get("/api/conversations/{id}/messages", copies.getLast())
                        .param("limit", "20");
                if (cursor != null) {
                    page.param("cursor", cursor);
                }
                long started = System.nanoTime();
                Map<String, Object> body = json(page);
                slowest = Math.max(slowest, millisSince(started));
                listed.addAll(JsonPath.read(body, "$.items[*].id"));
                cursor = (String) body.get("nextCursor");
            } while (cursor != null);

            assertThat(listed).as("each message of a group once").doesNotHaveDuplicates();
            assertThat(listed).as("from the copy it went from, else the oldest")
                    .containsExactlyInAnyOrderElementsOf(expected.values().stream().map(UUID::toString).toList());
            stored += countOf("SELECT count(*) FROM message WHERE conversation_id IN ", copies);
            shown += listed.size();
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("groups of several copies", multiCopyGroups().size());
        report.put("messages stored in them", stored);
        report.put("messages shown", shown);
        report.put("slowest page of messages (ms)", slowest);
        print("messages by group", report);
    }

    // D-185 on a real group: archiving and marking unread reach every copy, and what it changed is set back.
    @Test
    void aChangeReachesEveryCopyAndIsUndone() throws Exception {
        List<UUID> copies = multiCopyGroups().stream().filter(this::neitherArchivedNorUnread).findFirst().orElse(null);
        assumeFalse(copies == null, "No group of several copies that is neither archived nor unread to try it on");
        UUID group = copies.getFirst();
        try {
            change(group, "{\"archived\": true}");
            assertThat(archivedCopies(copies)).as("archived in every copy").isEqualTo(copies.size());
            change(group, "{\"archived\": false}");
            assertThat(archivedCopies(copies)).as("back in the inbox in every copy").isZero();

            Map<String, Object> unread = change(group, "{\"read\": false}");
            assertThat(unread.get("unreadCount")).as("one unread message for the group, not one a copy").isEqualTo(1);
            Map<String, Object> read = change(group, "{\"read\": true}");
            assertThat(read.get("unreadCount")).isEqualTo(0);
            assertThat(unreadCopies(copies)).as("read in every copy").isZero();
        } finally {
            change(group, "{\"archived\": false, \"read\": true}");
        }
        print("a change of a group", Map.of("copies", copies.size(), "set back", neitherArchivedNorUnread(copies)));
    }

    // The groups of several copies in the inbox, each as its copies in the inbox from the oldest on (D-183).
    private List<List<UUID>> multiCopyGroups() {
        return jdbc.query("""
                SELECT array_agg(c.id ORDER BY c.created_at, c.id) FROM conversation c
                """ + IN_THE_INBOX + """
                 GROUP BY c.thread_group_id HAVING count(*) > 1 ORDER BY 1
                """, (row, n) -> List.of((UUID[]) row.getArray(1).getArray()), owner);
    }

    private long groupsOf(String having) {
        return jdbc.queryForObject("SELECT count(*) FROM (SELECT c.thread_group_id FROM conversation c "
                + IN_THE_INBOX + " GROUP BY c.thread_group_id " + having + ") g", Long.class, owner);
    }

    // Written out apart from the SQL of MessageHistory: each key once, the outbound message first, then the one of
    // the oldest copy, then the smaller ID.
    private Map<String, UUID> expectedMessages(List<UUID> copies) {
        Map<String, UUID> picked = new LinkedHashMap<>();
        Map<String, int[]> rank = new HashMap<>();
        for (Map<String, Object> message : jdbc.queryForList("SELECT m.id, m.conversation_id, m.direction, " + KEY
                + " AS key FROM message m WHERE m.conversation_id IN " + in(copies) + " ORDER BY m.id")) {
            String key = (String) message.get("key");
            int[] own = { "OUTBOUND".equals(message.get("direction")) ? 0 : 1,
                    copies.indexOf((UUID) message.get("conversation_id")) };
            int[] best = rank.get(key);
            if (best == null || own[0] < best[0] || own[0] == best[0] && own[1] < best[1]) {
                rank.put(key, own);
                picked.put(key, (UUID) message.get("id"));
            }
        }
        return picked;
    }

    private boolean neitherArchivedNorUnread(List<UUID> copies) {
        return archivedCopies(copies) == 0 && unreadCopies(copies) == 0;
    }

    private long archivedCopies(List<UUID> copies) {
        return countOf("SELECT count(*) FROM conversation WHERE archived AND id IN ", copies);
    }

    private long unreadCopies(List<UUID> copies) {
        return countOf("SELECT count(*) FROM conversation WHERE unread_count > 0 AND id IN ", copies);
    }

    private long countOf(String sql, List<UUID> ids) {
        return jdbc.queryForObject(sql + in(ids), Long.class);
    }

    // IDs read from the database, never from outside, written into the SQL as a list.
    private static String in(List<UUID> ids) {
        return "(" + String.join(",", ids.stream().map(id -> "'" + id + "'").toList()) + ")";
    }

    @SuppressWarnings("unchecked")
    private static List<String> accountIdsOf(Map<String, Object> row) {
        return (List<String>) row.get("accountIds");
    }

    private Pages everyRow(String view) throws Exception {
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> cursors = new HashSet<>();
        long slowest = 0;
        String cursor = null;
        do {
            MockHttpServletRequestBuilder page = get("/api/conversations").param("view", view).param("limit", "100");
            if (cursor != null) {
                page.param("cursor", cursor);
            }
            long started = System.nanoTime();
            Map<String, Object> body = json(page);
            slowest = Math.max(slowest, millisSince(started));
            rows.addAll(JsonPath.read(body, "$.items"));
            cursor = (String) body.get("nextCursor");
            assertThat(cursor == null || cursors.add(cursor)).as("pages move on").isTrue();
        } while (cursor != null);
        return new Pages(rows, slowest);
    }

    private Map<String, Object> change(UUID group, String body) throws Exception {
        String response = mvc.perform(patch("/api/conversations/{id}", group).with(user(email)).with(csrf())
                .contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$");
    }

    private Map<String, Object> json(MockHttpServletRequestBuilder request) throws Exception {
        String body = mvc.perform(request.with(user(email))).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString();
        return JsonPath.read(body, "$");
    }

    private static long millisSince(long started) {
        return (System.nanoTime() - started) / 1_000_000;
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

    private record Pages(List<Map<String, Object>> rows, long slowestMillis) {
    }

}
