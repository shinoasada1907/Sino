package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
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
import dev.sino.provider.spi.NormalizedRecipients;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * The messages of one conversation (BE-54, F06 spec {@code message-history}) through HTTP on the whole application and
 * a real PostgreSQL, with mail stored by the real {@link ConversationStore}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ConversationMessagesApiTests {

    private static final Instant MONDAY = Instant.parse("2026-10-05T08:00:00Z");
    private static final Instant TUESDAY = Instant.parse("2026-10-06T08:00:00.123456Z");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice", null,
            false);
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
    private UUID gmail;

    @BeforeEach
    void startFromAnEmptyInbox() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        gmail = connect(owner, "owner@gmail.test");
    }

    @Test
    void twentyFiveMessagesComeInTwoPagesNewestFirst() throws Exception {
        store(gmail, thread("report"), IntStream.range(0, 25)
                .mapToObj(i -> fromAlice("m-" + i, MONDAY.plusSeconds(60L * i), "Thư " + i))
                .toArray(NormalizedMessage[]::new));
        UUID conversation = conversationId("report");

        Map<String, Object> first = page(conversation, null, null);
        Map<String, Object> second = page(conversation, (String) first.get("nextCursor"), null);

        assertThat(texts(first)).containsExactlyElementsOf(
                IntStream.iterate(24, i -> i >= 5, i -> i - 1).mapToObj(i -> "Thư " + i).toList());
        assertThat(texts(second)).containsExactly("Thư 4", "Thư 3", "Thư 2", "Thư 1", "Thư 0");
        assertThat(second.get("nextCursor")).isNull();
    }

    @Test
    void messagesSentAtTheSameMomentAreNeitherRepeatedNorLostAtThePageCut() throws Exception {
        store(gmail, thread("report"), fromAlice("m-0", MONDAY, "Cũ nhất"), fromAlice("m-a", TUESDAY, "Cùng giờ a"),
                fromAlice("m-b", TUESDAY, "Cùng giờ b"), fromAlice("m-c", TUESDAY, "Cùng giờ c"));
        UUID conversation = conversationId("report");

        List<String> seen = new ArrayList<>();
        String cursor = null;
        int pages = 0;
        do {
            Map<String, Object> page = page(conversation, cursor, "2");
            seen.addAll(texts(page));
            cursor = (String) page.get("nextCursor");
            pages++;
        } while (cursor != null && pages < 5);

        List<String> sameMomentByIdNewestFirst = jdbc.queryForList(
                "select text_content from message where sent_at = ? order by id desc", String.class,
                java.sql.Timestamp.from(TUESDAY));
        assertThat(sameMomentByIdNewestFirst).hasSize(3);
        assertThat(seen.subList(0, 3)).containsExactlyElementsOf(sameMomentByIdNewestFirst);
        assertThat(seen).hasSize(4).last().isEqualTo("Cũ nhất");
        assertThat(pages).isEqualTo(2);
    }

    @Test
    void aMessageShowsWhoSentItWhoGotItAndItsFiles() throws Exception {
        NormalizedMessage question = new NormalizedMessage("m-1", "report", "alice@example.test",
                MessageDirection.INBOUND, MessageType.MIXED, "Chào bạn,\nGửi bạn báo giá.", MessageStatus.UNKNOWN,
                false, null, MONDAY, List.of(new NormalizedAttachment("part-2", "bao-gia.pdf", "application/pdf",
                        182000L, null, null, null)),
                Map.of(NormalizedMessage.SUBJECT, "Báo giá tháng 10", NormalizedMessage.BULK, "true"),
                new NormalizedRecipients(List.of(new Address(null, "owner@gmail.test"),
                        new Address("Trần, Bình", "binh@example.test")), List.of(new Address(null, "chi@example.test")),
                        List.of(new Address("Phòng kế toán", "ketoan@example.test"))), null);
        NormalizedMessage answer = new NormalizedMessage("m-2", "report", "owner@gmail.test",
                MessageDirection.OUTBOUND, MessageType.TEXT, "Cảm ơn chị.", MessageStatus.SENT, true, "m-1", TUESDAY,
                List.of(), Map.of(NormalizedMessage.SUBJECT, "Re: Báo giá tháng 10"),
                new NormalizedRecipients(List.of(new Address("Alice", "alice@example.test")), List.of(), List.of()),
                null);
        store(gmail, thread("report"), question, answer);
        UUID conversation = conversationId("report");
        UUID questionId = messageId("m-1");

        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].direction").value("OUTBOUND"))
                .andExpect(jsonPath("$.items[0].status").value("SENT"))
                .andExpect(jsonPath("$.items[0].sender.name").value(nullValue()))
                .andExpect(jsonPath("$.items[0].sender.address").value("owner@gmail.test"))
                .andExpect(jsonPath("$.items[0].sender.self").value(true))
                .andExpect(jsonPath("$.items[0].to[0].name").value("Alice"))
                .andExpect(jsonPath("$.items[0].cc.length()").value(0))
                .andExpect(jsonPath("$.items[0].read").value(true))
                .andExpect(jsonPath("$.items[0].attachments.length()").value(0))
                .andExpect(jsonPath("$.items[1].id").value(questionId.toString()))
                .andExpect(jsonPath("$.items[1].direction").value("INBOUND"))
                .andExpect(jsonPath("$.items[1].status").value("UNKNOWN"))
                .andExpect(jsonPath("$.items[1].sentAt").value("2026-10-05T08:00:00Z"))
                .andExpect(jsonPath("$.items[1].sender.name").value("Alice"))
                .andExpect(jsonPath("$.items[1].sender.address").value("alice@example.test"))
                .andExpect(jsonPath("$.items[1].sender.self").value(false))
                .andExpect(jsonPath("$.items[1].to.length()").value(2))
                .andExpect(jsonPath("$.items[1].to[0].name").value(nullValue()))
                .andExpect(jsonPath("$.items[1].to[0].address").value("owner@gmail.test"))
                .andExpect(jsonPath("$.items[1].to[1].name").value("Trần, Bình"))
                .andExpect(jsonPath("$.items[1].to[1].address").value("binh@example.test"))
                .andExpect(jsonPath("$.items[1].cc[0].address").value("chi@example.test"))
                .andExpect(jsonPath("$.items[1].subject").value("Báo giá tháng 10"))
                .andExpect(jsonPath("$.items[1].text").value("Chào bạn,\nGửi bạn báo giá."))
                .andExpect(jsonPath("$.items[1].bodyFormat").value("TEXT"))
                .andExpect(jsonPath("$.items[1].read").value(false))
                .andExpect(jsonPath("$.items[1].attachments.length()").value(1))
                .andExpect(jsonPath("$.items[1].attachments[0].id").isString())
                .andExpect(jsonPath("$.items[1].attachments[0].fileName").value("bao-gia.pdf"))
                .andExpect(jsonPath("$.items[1].attachments[0].mimeType").value("application/pdf"))
                .andExpect(jsonPath("$.items[1].attachments[0].sizeBytes").value(182000))
                .andExpect(jsonPath("$.items[1].replyTo").doesNotExist())
                .andExpect(jsonPath("$.items[1].html").doesNotExist())
                .andExpect(jsonPath("$.items[1].metadata").doesNotExist())
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
    }

    @Test
    void aStickerMessageListsTheAddressOfItsPictureAndAnyOtherMessageListsNone() throws Exception {
        String picture = "https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236";
        store(gmail, thread("report"), fromAlice("m-1", MONDAY, "Chữ"),
                new NormalizedMessage("m-2", "report", "alice@example.test", MessageDirection.INBOUND,
                        MessageType.UNKNOWN, "[Sticker]", MessageStatus.UNKNOWN, false, null, TUESDAY, List.of(),
                        Map.of("zaloType", "chat.sticker", NormalizedMessage.STICKER_URL, picture), null, null));

        mvc.perform(get("/api/conversations/{id}/messages", conversationId("report")).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].text").value("[Sticker]"))
                .andExpect(jsonPath("$.items[0].sticker").value(picture))
                .andExpect(jsonPath("$.items[1].sticker").value(nullValue()));
    }

    @Test
    void aStickerWithoutAPictureListsNoneAndTheMetadataStaysOutOfTheAnswer() throws Exception {
        store(gmail, thread("report"), new NormalizedMessage("m-1", "report", "alice@example.test",
                MessageDirection.INBOUND, MessageType.UNKNOWN, "[Sticker]", MessageStatus.UNKNOWN, false, null, MONDAY,
                List.of(), Map.of("zaloType", "chat.sticker", "stickerId", "11236"), null, null));

        mvc.perform(get("/api/conversations/{id}/messages", conversationId("report")).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].sticker").value(nullValue()))
                .andExpect(jsonPath("$.items[0].metadata").doesNotExist());
    }

    @Test
    void addresseesAreUnknownForMailStoredWithoutThemAndAMessageMayHaveNoSenderOrText() throws Exception {
        NormalizedMessage notice = new NormalizedMessage("m-1", "report", null, MessageDirection.INBOUND,
                MessageType.SYSTEM, null, MessageStatus.UNKNOWN, true, null, MONDAY, List.of(), Map.of(), null, null);
        store(gmail, thread("report"), notice);

        mvc.perform(get("/api/conversations/{id}/messages", conversationId("report")).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].sender").value(nullValue()))
                .andExpect(jsonPath("$.items[0].to").value(nullValue()))
                .andExpect(jsonPath("$.items[0].cc").value(nullValue()))
                .andExpect(jsonPath("$.items[0].subject").value(nullValue()))
                .andExpect(jsonPath("$.items[0].text").value(nullValue()));
    }

    @Test
    void anArchivedConversationOrOneOfAnExpiredAccountStillShowsItsMessages() throws Exception {
        store(gmail, thread("report"), fromAlice("m-1", MONDAY, "Lưu trữ"));
        jdbc.update("update conversation set archived = true");
        ConnectedAccount account = accounts.findById(gmail).orElseThrow();
        account.markAuthExpired();
        accounts.save(account);

        assertThat(texts(page(conversationId("report"), null, null))).containsExactly("Lưu trữ");
    }

    @Test
    void theMessagesOfAConversationOutsideTheInboxAreNotFound() throws Exception {
        UUID removed = connect(owner, "old@gmail.test");
        UUID disabled = connect(owner, "off@gmail.test");
        UUID foreign = connect(users.save(new AppUser("other@example.com", "Other")).id(), "other@gmail.test");
        store(removed, thread("gone"), fromAlice("gone", "m-1", MONDAY, "Đã xóa"));
        store(disabled, thread("off"), fromAlice("off", "m-1", MONDAY, "Đã tắt"));
        store(foreign, thread("theirs"), fromAlice("theirs", "m-1", MONDAY, "Của người khác"));
        ConnectedAccount gone = accounts.findById(removed).orElseThrow();
        gone.remove(Instant.parse("2026-10-09T00:00:00Z"));
        accounts.save(gone);
        ConnectedAccount off = accounts.findById(disabled).orElseThrow();
        off.disable();
        accounts.save(off);

        for (UUID conversation : List.of(conversationId(removed, "gone"), conversationId(disabled, "off"),
                conversationId(foreign, "theirs"), UUID.randomUUID())) {
            mvc.perform(get("/api/conversations/{id}/messages", conversation).with(apiUser()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("CONVERSATION_NOT_FOUND"));
        }
    }

    @ParameterizedTest
    @CsvSource({ "limit, 0, VALIDATION_FAILED", "limit, 101, VALIDATION_FAILED", "limit, many, MALFORMED_REQUEST",
        "cursor, not-a-cursor, MALFORMED_REQUEST", "cursor, bm90LWEtY3Vyc29y, MALFORMED_REQUEST" })
    void aBadParameterIsABadRequest(String name, String value, String code) throws Exception {
        store(gmail, thread("report"), fromAlice("m-1", MONDAY, "Thư"));

        mvc.perform(get("/api/conversations/{id}/messages", conversationId("report")).param(name, value)
                .with(apiUser()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(code));
    }

    @Test
    void aCursorOfTheInboxIsNotACursorOfTheMessages() throws Exception {
        store(gmail, thread("report"), fromAlice("m-1", MONDAY, "Thư"));
        store(gmail, thread("other"), fromAlice("other", "m-2", TUESDAY, "Thư khác"));
        String inboxCursor = JsonPath.read(mvc.perform(get("/api/conversations").param("limit", "1").with(apiUser()))
                .andReturn().getResponse().getContentAsString(), "$.nextCursor");
        assertThat(inboxCursor).isNotNull();

        mvc.perform(get("/api/conversations/{id}/messages", conversationId("report")).param("cursor", inboxCursor)
                .with(apiUser()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void aSignedOutCallerGetsNothing() throws Exception {
        store(gmail, thread("report"), fromAlice("m-1", MONDAY, "Thư"));

        mvc.perform(get("/api/conversations/{id}/messages", conversationId("report")))
                .andExpect(status().isUnauthorized());
    }

    private Map<String, Object> page(UUID conversation, String cursor, String limit) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/conversations/{id}/messages", conversation);
        if (cursor != null) {
            request.param("cursor", cursor);
        }
        if (limit != null) {
            request.param("limit", limit);
        }
        return JsonPath.read(mvc.perform(request.with(apiUser())).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(), "$");
    }

    private static List<String> texts(Map<String, Object> page) {
        return JsonPath.read(page, "$.items[*].text");
    }

    private UUID connect(UUID user, String externalAccountId) {
        return accounts.save(ConnectedAccount.register(user, ProviderType.of("gmail"), externalAccountId, "Account",
                null, null)).id();
    }

    private UUID conversationId(String conversation) {
        return conversationId(gmail, conversation);
    }

    private UUID conversationId(UUID account, String conversation) {
        return jdbc.queryForObject("select id from conversation where account_id = ? and external_conversation_id = ?",
                UUID.class, account, conversation);
    }

    private UUID messageId(String externalId) {
        return jdbc.queryForObject("select id from message where external_message_id = ?", UUID.class, externalId);
    }

    private void store(UUID account, NormalizedConversation conversation, NormalizedMessage... messages) {
        transactions.executeWithoutResult(t -> store.store(account, new SyncBatch(List.of(conversation),
                List.of(messages), List.of(), new SyncCursor("next"), false)));
    }

    private static NormalizedConversation thread(String id) {
        return new NormalizedConversation(id, ConversationType.THREAD, "Thread " + id, null, List.of(ALICE, OWNER),
                null);
    }

    private static NormalizedMessage fromAlice(String id, Instant sentAt, String text) {
        return fromAlice("report", id, sentAt, text);
    }

    private static NormalizedMessage fromAlice(String conversation, String id, Instant sentAt, String text) {
        return new NormalizedMessage(id, conversation, "alice@example.test", MessageDirection.INBOUND, MessageType.TEXT,
                text, MessageStatus.UNKNOWN, true, null, sentAt, List.of(), Map.of(), null, null);
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

}
