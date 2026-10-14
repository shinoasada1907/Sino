package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
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
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * The inbox API (BE-44) through HTTP on the whole application and a real PostgreSQL: real security, real owner,
 * mail stored by the real {@link ConversationStore}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ConversationsApiTests {

    private static final Instant MONDAY = Instant.parse("2026-10-05T08:00:00Z");
    private static final Instant TUESDAY = Instant.parse("2026-10-06T08:00:00Z");
    private static final Instant WEDNESDAY = Instant.parse("2026-10-07T08:00:00.123Z");
    private static final Instant THURSDAY = Instant.parse("2026-10-08T08:00:00Z");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice",
            "https://example.test/alice.png", false);
    private static final NormalizedParticipant OWNER = new NormalizedParticipant("owner@gmail.test", null, null,
            true);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ConnectedAccountRepository accounts;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private ConversationStore store;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;
    private UUID otherUser;

    @BeforeEach
    void startFromAnEmptyInbox() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        otherUser = users.save(new AppUser("other@example.com", "Other")).id();
    }

    @Test
    void theInboxListsTheConversationsOfActiveAccountsNewestFirst() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        UUID disabled = connect(owner, "telegram", "4242");
        disable(disabled);
        UUID removed = connect(owner, "gmail", "old@gmail.test");
        UUID expired = connect(owner, "gmail", "expired@gmail.test");
        expire(expired);
        UUID foreign = connect(otherUser, "gmail", "other@gmail.test");
        mail(gmail, "older", MONDAY);
        mail(gmail, "report", WEDNESDAY);
        mail(expired, "stale", Instant.parse("2026-10-07T09:00:00Z"));
        mail(gmail, "kept", TUESDAY);
        archive(gmail, "kept");
        mail(disabled, "chat", THURSDAY);
        mail(removed, "gone", THURSDAY);
        remove(removed);
        mail(foreign, "theirs", THURSDAY);

        mvc.perform(get("/api/conversations").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].subject", contains("Thread stale", "Thread report", "Thread older")))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
        assertThat(jdbc.queryForObject("select count(*) from message m join conversation c on c.id = m.conversation_id"
                + " where c.account_id = ?", Long.class, removed)).as("D-66: the mail of a removed account stays")
                .isEqualTo(1);
    }

    @Test
    void anEmailThreadShowsItsCounterpartSubjectAndSnippet() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        store(gmail, thread("report", "Báo cáo tháng 9", ALICE, OWNER),
                message("report", "m-1", MessageDirection.OUTBOUND, "owner@gmail.test", MONDAY, "Gửi chị", true,
                        Map.of()),
                message("report", "m-2", MessageDirection.INBOUND, "alice@example.test", WEDNESDAY,
                        "Xin chào,\n\nĐây là   báo cáo.", false, Map.of(),
                        new NormalizedAttachment("1", "report.pdf", "application/pdf", 10L, null, null, null)));

        String body = mvc.perform(get("/api/conversations").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(conversationId(gmail, "report").toString()))
                .andExpect(jsonPath("$.items[0].accountId").value(gmail.toString()))
                .andExpect(jsonPath("$.items[0].provider").value("gmail"))
                .andExpect(jsonPath("$.items[0].kind").value("EMAIL"))
                .andExpect(jsonPath("$.items[0].title").value("Alice"))
                .andExpect(jsonPath("$.items[0].subject").value("Báo cáo tháng 9"))
                .andExpect(jsonPath("$.items[0].memberCount").value(nullValue()))
                .andExpect(jsonPath("$.items[0].snippetFrom").value(nullValue()))
                .andExpect(jsonPath("$.items[0].snippet").value("Xin chào, Đây là báo cáo."))
                .andExpect(jsonPath("$.items[0].lastMessageAt").value("2026-10-07T08:00:00.123Z"))
                .andExpect(jsonPath("$.items[0].unreadCount").value(1))
                .andExpect(jsonPath("$.items[0].needsReply").value(true))
                .andExpect(jsonPath("$.items[0].hasAttachments").value(true))
                .andExpect(jsonPath("$.items[0].archived").value(false))
                .andExpect(jsonPath("$.items[0].snooze").value(nullValue()))
                .andExpect(jsonPath("$.items[0].scheduledSend").value(nullValue()))
                .andExpect(jsonPath("$.items[0].linked", empty()))
                .andReturn().getResponse().getContentAsString();

        Map<String, Object> item = JsonPath.read(body, "$.items[0]");
        assertThat(item.keySet()).as("no message text beyond the snippet, no HTML").containsExactlyInAnyOrder("id",
                "accountId", "accountIds", "provider", "kind", "title", "subject", "memberCount", "snippetFrom",
                "snippet", "lastMessageAt", "unreadCount", "needsReply", "hasAttachments", "archived", "snooze",
                "scheduledSend", "linked");
    }

    @Test
    void aGroupChatShowsItsTitleMembersAndLastSender() throws Exception {
        UUID chat = connect(owner, "telegram", "4242");
        NormalizedParticipant bob = new NormalizedParticipant("bob", "Bob", null, false);
        store(chat, new NormalizedConversation("group", ConversationType.GROUP, "Nhóm dự án", null,
                List.of(ALICE, bob, OWNER), TUESDAY),
                message("group", "m-1", MessageDirection.INBOUND, "bob", TUESDAY, "Họp lúc 9 giờ", false, Map.of()));

        mvc.perform(get("/api/conversations").with(apiUser()))
                .andExpect(jsonPath("$.items[0].kind").value("CHAT"))
                .andExpect(jsonPath("$.items[0].title").value("Nhóm dự án"))
                .andExpect(jsonPath("$.items[0].subject").value(nullValue()))
                .andExpect(jsonPath("$.items[0].memberCount").value(3))
                .andExpect(jsonPath("$.items[0].snippetFrom").value("Bob"));
    }

    @ParameterizedTest
    @CsvSource(nullValues = "-", value = {
        "all, unread;reply;files;plain", "unread, unread", "reply, reply", "attachments, files",
        "archived, archived", "scheduled, -", "snoozed, -" })
    void eachViewShowsItsConversations(String view, String expected) throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        // Newest first: unread, reply, files, plain; archived is the newest of all but archived.
        store(gmail, thread("plain", "plain", ALICE, OWNER), message("plain", "m-1", MessageDirection.OUTBOUND,
                "owner@gmail.test", MONDAY, "Đã gửi", true, Map.of()));
        store(gmail, thread("files", "files", ALICE, OWNER), message("files", "m-1", MessageDirection.OUTBOUND,
                "owner@gmail.test", Instant.parse("2026-10-05T09:00:00Z"), "Tệp", true, Map.of(),
                new NormalizedAttachment("1", "a.pdf", "application/pdf", 1L, null, null, null)));
        store(gmail, thread("reply", "reply", ALICE, OWNER), message("reply", "m-1", MessageDirection.INBOUND,
                "alice@example.test", TUESDAY, "Chị hỏi", true, Map.of()));
        store(gmail, thread("unread", "unread", ALICE, OWNER), message("unread", "m-1", MessageDirection.INBOUND,
                "alice@example.test", WEDNESDAY, "Bản tin", false, Map.of("bulk", "true")));
        store(gmail, thread("archived", "archived", ALICE, OWNER), message("archived", "m-1",
                MessageDirection.INBOUND, "alice@example.test", THURSDAY, "Cũ", false, Map.of(),
                new NormalizedAttachment("1", "b.pdf", "application/pdf", 1L, null, null, null)));
        archive(gmail, "archived");

        List<String> subjects = JsonPath.read(mvc.perform(get("/api/conversations").param("view", view)
                .with(apiUser())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
                "$.items[*].subject");

        assertThat(subjects).containsExactly(expected == null ? new String[0] : expected.split(";"));
    }

    @Test
    void theProviderAndAccountFiltersNarrowTheList() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        UUID work = connect(owner, "gmail", "owner@work.test");
        UUID chat = connect(owner, "telegram", "4242");
        UUID foreign = connect(otherUser, "gmail", "other@gmail.test");
        mail(gmail, "home", MONDAY);
        mail(work, "work", TUESDAY);
        mail(chat, "chat", WEDNESDAY);
        mail(foreign, "theirs", THURSDAY);

        assertThat(subjects(get("/api/conversations").param("provider", "gmail")))
                .containsExactly("Thread work", "Thread home");
        assertThat(subjects(get("/api/conversations").param("accountId", work.toString())))
                .containsExactly("Thread work");
        assertThat(subjects(get("/api/conversations").param("provider", "telegram").param("accountId",
                work.toString()))).isEmpty();
        assertThat(subjects(get("/api/conversations").param("accountId", foreign.toString())))
                .as("another owner's account is no filter at all").isEmpty();
        assertThat(subjects(get("/api/conversations").param("provider", "nothing"))).isEmpty();
        assertThat(subjects(get("/api/conversations").param("provider", "Gmail")))
                .containsExactly("Thread work", "Thread home");
        assertThat(subjects(get("/api/conversations").param("provider", ""))).hasSize(3);
    }

    @Test
    void pagesThroughConversationsOfTheSameTimeEachOnce() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        for (int n = 1; n <= 5; n++) {
            mail(gmail, "same-" + n, TUESDAY);
        }
        mail(gmail, "newest", THURSDAY);

        List<String> seen = new ArrayList<>();
        String cursor = null;
        int pages = 0;
        do {
            var request = get("/api/conversations").param("limit", "2");
            if (cursor != null) {
                request.param("cursor", cursor);
            }
            String body = mvc.perform(request.with(apiUser())).andExpect(status().isOk()).andReturn().getResponse()
                    .getContentAsString();
            seen.addAll(JsonPath.<List<String>>read(body, "$.items[*].subject"));
            cursor = JsonPath.read(body, "$.nextCursor");
            pages++;
        } while (cursor != null && pages < 10);

        assertThat(pages).isEqualTo(3);
        assertThat(seen).hasSize(6).doesNotHaveDuplicates().first().isEqualTo("Thread newest");
        List<String> sameTime = seen.subList(1, 6);
        List<String> byIdDescending = jdbc.queryForList("select title from conversation where account_id = ?"
                + " and last_message_at = ? order by id desc", String.class, gmail,
                java.sql.Timestamp.from(TUESDAY));
        assertThat(sameTime).as("ties broken by id, newest id first").isEqualTo(byIdDescending);
    }

    @Test
    void pagesThroughSeveralAccountsInOneOrder() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        UUID work = connect(owner, "gmail", "owner@work.test");
        mail(gmail, "g1", Instant.parse("2026-10-05T01:00:00Z"));
        mail(work, "w1", Instant.parse("2026-10-05T02:00:00Z"));
        mail(gmail, "g2", Instant.parse("2026-10-05T03:00:00Z"));
        mail(work, "w2", Instant.parse("2026-10-05T04:00:00Z"));
        mail(gmail, "g3", Instant.parse("2026-10-05T05:00:00Z"));

        List<String> seen = new ArrayList<>();
        String cursor = null;
        do {
            var request = get("/api/conversations").param("limit", "2");
            if (cursor != null) {
                request.param("cursor", cursor);
            }
            String body = mvc.perform(request.with(apiUser())).andExpect(status().isOk()).andReturn().getResponse()
                    .getContentAsString();
            seen.addAll(JsonPath.<List<String>>read(body, "$.items[*].subject"));
            cursor = JsonPath.read(body, "$.nextCursor");
        } while (cursor != null && seen.size() < 10);

        assertThat(seen).containsExactly("Thread g3", "Thread w2", "Thread g2", "Thread w1", "Thread g1");
    }

    @ParameterizedTest
    @CsvSource({ "view, starred, VALIDATION_FAILED", "limit, 0, VALIDATION_FAILED", "limit, 101, VALIDATION_FAILED",
        "limit, many, MALFORMED_REQUEST", "cursor, not-a-cursor, MALFORMED_REQUEST",
        "cursor, bm90LWEtY3Vyc29y, MALFORMED_REQUEST", "accountId, not-a-uuid, MALFORMED_REQUEST" })
    void aBadParameterIsABadRequest(String name, String value, String code) throws Exception {
        mvc.perform(get("/api/conversations").param(name, value).with(apiUser()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(code));
    }

    @Test
    void theCountsCoverTheSameAccountsAsTheList() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        UUID chat = connect(owner, "telegram", "4242");
        UUID disabled = connect(owner, "slack", "team");
        disable(disabled);
        connect(owner, "outlook", "owner@outlook.test");
        UUID expired = connect(owner, "yahoo", "owner@yahoo.test");
        expire(expired);
        mail(expired, "stale", MONDAY);
        for (String name : List.of("a", "b", "c")) {
            mail(gmail, name, MONDAY);
        }
        mail(gmail, "archived", TUESDAY);
        archive(gmail, "archived");
        store(gmail, thread("files", "files", ALICE, OWNER), message("files", "m-1", MessageDirection.OUTBOUND,
                "owner@gmail.test", WEDNESDAY, "Tệp", true, Map.of(),
                new NormalizedAttachment("1", "a.pdf", "application/pdf", 1L, null, null, null)));
        store(chat, thread("read-chat", "read", ALICE, OWNER), message("read-chat", "m-1", MessageDirection.INBOUND,
                "alice@example.test", MONDAY, "Đã đọc", true, Map.of()));
        mail(disabled, "hidden", MONDAY);

        mvc.perform(get("/api/conversations/counts").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(4))
                .andExpect(jsonPath("$.byProvider.gmail").value(3))
                .andExpect(jsonPath("$.byProvider.yahoo").value(1))
                .andExpect(jsonPath("$.byProvider.telegram").value(0))
                .andExpect(jsonPath("$.byProvider.outlook").value(0))
                .andExpect(jsonPath("$.byProvider.slack").doesNotExist())
                .andExpect(jsonPath("$.needsReply").value(5))
                .andExpect(jsonPath("$.withAttachments").value(1))
                .andExpect(jsonPath("$.scheduled").value(0))
                .andExpect(jsonPath("$.snoozed").value(0));
    }

    @Test
    void oneConversationComesWithItsParticipants() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        mail(gmail, "report", MONDAY);
        UUID id = conversationId(gmail, "report");

        mvc.perform(get("/api/conversations/{id}", id).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.title").value("Alice"))
                .andExpect(jsonPath("$.participants[0].externalId").value("alice@example.test"))
                .andExpect(jsonPath("$.participants[0].name").value("Alice"))
                .andExpect(jsonPath("$.participants[0].avatarUrl").value("https://example.test/alice.png"))
                .andExpect(jsonPath("$.participants[0].self").value(false))
                .andExpect(jsonPath("$.participants[1].externalId").value("owner@gmail.test"))
                .andExpect(jsonPath("$.participants[1].name").value(nullValue()))
                .andExpect(jsonPath("$.participants[1].self").value(true));
    }

    @Test
    void aConversationOutOfReachIsNotFound() throws Exception {
        // The owner has an account in the inbox too, so the lookup really runs and must leave the others out.
        UUID active = connect(owner, "gmail", "owner@gmail.test");
        mail(active, "mine", MONDAY);
        UUID disabled = connect(owner, "gmail", "off@gmail.test");
        UUID removed = connect(owner, "gmail", "old@gmail.test");
        UUID foreign = connect(otherUser, "gmail", "other@gmail.test");
        mail(disabled, "off", MONDAY);
        mail(removed, "gone", MONDAY);
        mail(foreign, "theirs", MONDAY);
        disable(disabled);
        remove(removed);

        for (UUID id : List.of(conversationId(disabled, "off"), conversationId(removed, "gone"),
                conversationId(foreign, "theirs"), UUID.randomUUID())) {
            mvc.perform(get("/api/conversations/{id}", id).with(apiUser()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("CONVERSATION_NOT_FOUND"));
            mvc.perform(patch("/api/conversations/{id}", id).with(apiUser()).with(csrf())
                    .contentType(APPLICATION_JSON).content("{\"read\": true}"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("CONVERSATION_NOT_FOUND"));
        }
        mvc.perform(get("/api/conversations/{id}", "not-a-uuid").with(apiUser()))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from message where is_read", Long.class))
                .as("nothing out of reach was changed").isZero();
    }

    @Test
    void readMarksEveryMessageReadInSinoOnly() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        store(gmail, thread("report", "Báo cáo", ALICE, OWNER),
                message("report", "m-1", MessageDirection.INBOUND, "alice@example.test", MONDAY, "Một", false,
                        Map.of()),
                message("report", "m-2", MessageDirection.INBOUND, "alice@example.test", TUESDAY, "Hai", false,
                        Map.of()));
        UUID id = conversationId(gmail, "report");

        mvc.perform(patch("/api/conversations/{id}", id).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"read\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.unreadCount").value(0));
        assertThat(readStates(id)).as("D-67: what Gmail said stays as it was")
                .containsExactly(List.of(true, false), List.of(true, false));

        mvc.perform(patch("/api/conversations/{id}", id).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"read\": false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(1));
        assertThat(readStates(id)).as("only the newest message is unread again")
                .containsExactly(List.of(true, false), List.of(false, false));
    }

    @Test
    void archivingMovesAConversationBetweenTheViews() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        mail(gmail, "report", MONDAY);
        UUID id = conversationId(gmail, "report");

        mvc.perform(patch("/api/conversations/{id}", id).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"archived\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.archived").value(true));
        assertThat(subjects(get("/api/conversations"))).isEmpty();
        assertThat(subjects(get("/api/conversations").param("view", "archived"))).containsExactly("Thread report");

        mvc.perform(patch("/api/conversations/{id}", id).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"archived\": false, \"read\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.archived").value(false))
                .andExpect(jsonPath("$.unreadCount").value(0));
        assertThat(subjects(get("/api/conversations"))).containsExactly("Thread report");
    }

    @ParameterizedTest
    @ValueSource(strings = { "{}", "{\"reed\": true}", "{\"read\": null}" })
    void aChangeMustSayWhatToChange(String body) throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        mail(gmail, "report", MONDAY);

        mvc.perform(patch("/api/conversations/{id}", conversationId(gmail, "report")).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void unreadMarksTheNewestMessageWhoeverSentIt() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        store(gmail, thread("report", "Báo cáo", ALICE, OWNER),
                message("report", "m-1", MessageDirection.INBOUND, "alice@example.test", MONDAY, "Hỏi", true,
                        Map.of()),
                message("report", "m-2", MessageDirection.OUTBOUND, "owner@gmail.test", TUESDAY, "Trả lời", true,
                        Map.of()));
        UUID id = conversationId(gmail, "report");

        mvc.perform(patch("/api/conversations/{id}", id).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"read\": false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(1));
        assertThat(readStates(id)).containsExactly(List.of(true, true), List.of(false, true));
    }

    @Test
    void aConversationWithoutMessagesCanBeMarkedUnreadToNoEffect() throws Exception {
        UUID chat = connect(owner, "telegram", "4242");
        store(chat, new NormalizedConversation("group", ConversationType.GROUP, "Nhóm trống", null, List.of(ALICE),
                MONDAY));

        mvc.perform(patch("/api/conversations/{id}", conversationId(chat, "group")).with(apiUser()).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"read\": false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0))
                .andExpect(jsonPath("$.snippet").value(nullValue()));
    }

    @Test
    void aConversationWithNobodyToNameHasAnEmptyTitle() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        store(gmail, thread("note", null, OWNER), message("note", "m-1", MessageDirection.OUTBOUND,
                "owner@gmail.test", MONDAY, "Ghi chú", true, Map.of()));

        mvc.perform(get("/api/conversations/{id}", conversationId(gmail, "note")).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value(""))
                .andExpect(jsonPath("$.subject").value(nullValue()));
    }

    @Test
    void aCursorBeyondWhatTheDatabaseStoresIsABadRequest() throws Exception {
        String cursor = java.util.Base64.getUrlEncoder().encodeToString(
                "+10000-01-01T00:00:00Z|0199c7a0-0000-7000-8000-000000000001".getBytes(
                        java.nio.charset.StandardCharsets.UTF_8));
        connect(owner, "gmail", "owner@gmail.test");

        mvc.perform(get("/api/conversations").param("cursor", cursor).with(apiUser()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void aChangeNeedsTheCsrfToken() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        mail(gmail, "report", MONDAY);

        mvc.perform(patch("/api/conversations/{id}", conversationId(gmail, "report")).with(apiUser())
                .contentType(APPLICATION_JSON).content("{\"read\": true}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void theInboxNeedsASignedInUser() throws Exception {
        mvc.perform(get("/api/conversations")).andExpect(status().isUnauthorized());
    }

    @Test
    void aChangeWaitsForAStoreOfTheSameAccount() throws Exception {
        UUID gmail = connect(owner, "gmail", "owner@gmail.test");
        mail(gmail, "report", MONDAY);
        UUID id = conversationId(gmail, "report");
        CountDownLatch stored = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        try {
            // A store of the same account that touches none of the rows the change touches.
            CompletableFuture<Void> storing = CompletableFuture.runAsync(() -> transactions.executeWithoutResult(t -> {
                store.store(gmail, batch(thread("other", "Khác", ALICE, OWNER), message("other", "m-1",
                        MessageDirection.INBOUND, "alice@example.test", TUESDAY, "Khác", false, Map.of())));
                stored.countDown();
                await(commit);
            }));
            assertThat(stored.await(10, TimeUnit.SECONDS)).isTrue();

            CompletableFuture<Integer> change = CompletableFuture.supplyAsync(() -> patchStatus(id));
            assertThatExceptionOfType(TimeoutException.class).isThrownBy(() -> change.get(1, TimeUnit.SECONDS));
            commit.countDown();
            assertThat(change.get(10, TimeUnit.SECONDS)).isEqualTo(200);
            storing.get(10, TimeUnit.SECONDS);
        } finally {
            commit.countDown();
        }
    }

    private int patchStatus(UUID id) {
        try {
            return mvc.perform(patch("/api/conversations/{id}", id).with(apiUser()).with(csrf())
                    .contentType(APPLICATION_JSON).content("{\"read\": true}")).andReturn().getResponse().getStatus();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private List<String> subjects(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
            throws Exception {
        return JsonPath.read(mvc.perform(request.with(apiUser())).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString(), "$.items[*].subject");
    }

    private List<List<Boolean>> readStates(UUID conversation) {
        return jdbc.query("select is_read, provider_read from message where conversation_id = ? order by sent_at",
                (row, n) -> List.of(row.getBoolean(1), row.getBoolean(2)), conversation);
    }

    private UUID connect(UUID user, String provider, String externalAccountId) {
        return accounts.save(ConnectedAccount.register(user, ProviderType.of(provider), externalAccountId, "Account",
                null, null)).id();
    }

    private void expire(UUID account) {
        ConnectedAccount found = accounts.findById(account).orElseThrow();
        found.markAuthExpired();
        accounts.save(found);
    }

    private void disable(UUID account) {
        ConnectedAccount found = accounts.findById(account).orElseThrow();
        found.disable();
        accounts.save(found);
    }

    private void remove(UUID account) {
        ConnectedAccount found = accounts.findById(account).orElseThrow();
        found.remove(Instant.parse("2026-10-09T00:00:00Z"));
        accounts.save(found);
    }

    private void archive(UUID account, String conversation) {
        jdbc.update("update conversation set archived = true where account_id = ? and external_conversation_id = ?",
                account, conversation);
    }

    private UUID conversationId(UUID account, String conversation) {
        return jdbc.queryForObject("select id from conversation where account_id = ? and external_conversation_id = ?",
                UUID.class, account, conversation);
    }

    // One unread message from Alice in a thread titled "Thread <name>".
    private void mail(UUID account, String conversation, Instant at) {
        store(account, thread(conversation, "Thread " + conversation, ALICE, OWNER), message(conversation, "m-1",
                MessageDirection.INBOUND, "alice@example.test", at, "Thư " + conversation, false, Map.of()));
    }

    private void store(UUID account, NormalizedConversation conversation, NormalizedMessage... messages) {
        transactions.executeWithoutResult(t -> store.store(account, batch(conversation, messages)));
    }

    private static SyncBatch batch(NormalizedConversation conversation, NormalizedMessage... messages) {
        return new SyncBatch(List.of(conversation), List.of(messages), List.of(), new SyncCursor("next"), false);
    }

    private static NormalizedConversation thread(String id, String title, NormalizedParticipant... participants) {
        return new NormalizedConversation(id, ConversationType.THREAD, title, null, List.of(participants), null);
    }

    private static NormalizedMessage message(String conversation, String id, MessageDirection direction,
            String sender, Instant sentAt, String text, boolean read, Map<String, String> metadata,
            NormalizedAttachment... files) {
        return new NormalizedMessage(id, conversation, sender, direction,
                files.length == 0 ? MessageType.TEXT : MessageType.MIXED, text,
                direction == MessageDirection.OUTBOUND ? MessageStatus.SENT : MessageStatus.UNKNOWN, read, null,
                sentAt, List.of(files), metadata, null, null);
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

}
