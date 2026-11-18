package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.ReactionKind;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Reacting to a message and quoting one in a reply (zalo-reactions RX-07, zalo-quote-reply QR-03): the endpoints on the
 * whole application and a real PostgreSQL, with a fake connector that reacts and quotes like Zalo does.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, ConversationReactionQuoteApiTests.Connectors.class })
@ActiveProfiles("test")
class ConversationReactionQuoteApiTests {

    static final String CHAT = "fake-react-chat";
    private static final Instant MONDAY = Instant.parse("2026-10-19T08:00:00Z");
    private static final NormalizedParticipant FRIEND = new NormalizedParticipant("8001", "An", null, false);
    private static final NormalizedParticipant ME = new NormalizedParticipant("7001", "Me", null, true);
    private static final Map<String, String> REACTABLE = Map.of("cliMsgId", "5001", "ttl", "0", "msgType", "webchat");

    @TestConfiguration(proxyBeanMethods = false)
    static class Connectors {

        @Bean
        FakeMessageProvider reactChatProvider() {
            return FakeMessageProvider.builder(CHAT)
                    .capabilities(ProviderCapability.READ_MESSAGES, ProviderCapability.SEND_MESSAGES)
                    .reactions(new ReactionKind("/-heart", "❤️", "Tim", true),
                            new ReactionKind(":>", "😄", "Haha", true))
                    .quotes().build();
        }

    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ConnectedAccountRepository accounts;

    @Autowired
    private CredentialStore credentials;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private ConversationStore store;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    @Qualifier("reactChatProvider")
    private FakeMessageProvider chat;

    private UUID owner;
    private UUID account;
    private UUID conversation;

    @BeforeEach
    void aChatWithAFriendWhoWroteTwice() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        chat.forgetSends();
        account = accounts.save(ConnectedAccount.register(owner, ProviderType.of(CHAT), "7001", "Me", null, null)).id();
        credentials.save(account, new TokenCredentials("{\"session\": \"sample\"}"), null);
        transactions.executeWithoutResult(t -> store.store(account, batch(
                inbound("m-1", "Chiều nay họp", REACTABLE), inbound("m-2", "Tin cũ chưa có cliMsgId", Map.of()))));
        conversation = jdbc.queryForObject("select id from conversation where account_id = ?", UUID.class, account);
    }

    @Test
    void aReactionIsPutOnTheProviderThenStoredAndAnswered() throws Exception {
        react(messageId("m-1"), "/-heart").andExpect(status().isOk())
                .andExpect(jsonPath("$.reactions", hasSize(1)))
                .andExpect(jsonPath("$.reactions[0].code").value("/-heart"))
                .andExpect(jsonPath("$.reactions[0].count").value(1))
                .andExpect(jsonPath("$.reactions[0].mine").value(true))
                .andExpect(jsonPath("$.reactions[0].names[0]").value("Bạn"));

        assertThat(chat.reactions()).singleElement().satisfies(command -> {
            assertThat(command.externalMessageId()).isEqualTo("m-1");
            assertThat(command.code()).isEqualTo("/-heart");
            assertThat(command.messageMetadata()).containsEntry("cliMsgId", "5001");
        });
        assertThat(jdbc.queryForList("select reactor_external_id, is_self, code from message_reaction"))
                .singleElement().satisfies(row -> assertThat(row).containsEntry("reactor_external_id", "7001")
                        .containsEntry("is_self", true).containsEntry("code", "/-heart"));
    }

    @Test
    void aSecondReactionReplacesTheFirstAndADeleteTakesItOff() throws Exception {
        react(messageId("m-1"), "/-heart").andExpect(status().isOk());
        react(messageId("m-1"), ":>").andExpect(status().isOk()).andExpect(jsonPath("$.reactions", hasSize(1)))
                .andExpect(jsonPath("$.reactions[0].code").value(":>"));

        mvc.perform(delete(reactionUrl(messageId("m-1"))).with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reactions", hasSize(0)));

        assertThat(chat.reactions()).extracting(command -> command.code()).containsExactly("/-heart", ":>", "");
    }

    @Test
    void theListAndTheDetailShowReactionsAndWhatCanBeDone() throws Exception {
        react(messageId("m-1"), "/-heart").andExpect(status().isOk());

        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.text == 'Chiều nay họp')].canReact").value(true))
                .andExpect(jsonPath("$.items[?(@.text == 'Chiều nay họp')].canQuote").value(true))
                .andExpect(jsonPath("$.items[?(@.text == 'Chiều nay họp')].reactions[0].emoji")
                        .value("❤️"))
                .andExpect(jsonPath("$.items[?(@.text == 'Tin cũ chưa có cliMsgId')].canQuote").value(false));
        mvc.perform(get("/api/conversations/{id}", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.reactionSet", hasSize(2)))
                .andExpect(jsonPath("$.reactionSet[0].code").value("/-heart"))
                .andExpect(jsonPath("$.reactionSet[0].quick").value(true));
    }

    @Test
    void aReactionTheConnectorRefusesStoresNothing() throws Exception {
        react(messageId("m-1"), "/-nope").andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("REACTION_UNKNOWN"));

        assertThat(chat.reactions()).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from message_reaction", Long.class)).isZero();
    }

    @Test
    void aMessageOfAnotherConversationIsNotFound() throws Exception {
        react(UUID.randomUUID(), "/-heart").andExpect(status().isNotFound());

        assertThat(chat.reactions()).isEmpty();
    }

    @Test
    void aSentReplyCanBeQuotedAndComesBackWithItsQuote() throws Exception {
        UUID original = messageId("m-1");
        UUID client = UUID.randomUUID();

        postJson("{\"text\": \"Ok mình tới\", \"clientMessageId\": \"" + client + "\", \"replyToMessageId\": \""
                + original + "\"}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.quote.messageId").value(original.toString()))
                .andExpect(jsonPath("$.quote.senderName").value("An"))
                .andExpect(jsonPath("$.quote.text").value("Chiều nay họp"));

        assertThat(chat.sentMessages()).singleElement().satisfies(command -> {
            assertThat(command.quote()).isNotNull();
            assertThat(command.quote().externalMessageId()).isEqualTo("m-1");
            assertThat(command.quote().senderExternalId()).isEqualTo("8001");
            assertThat(command.quote().metadata()).containsEntry("cliMsgId", "5001");
            assertThat(command.replyToExternalMessageId()).isEqualTo("m-1");
        });
        assertThat(jdbc.queryForObject("select reply_to_external_message_id from message where client_message_id = ?",
                String.class, client)).isEqualTo("m-1");
    }

    @Test
    void aReplySentFromSinoBecomesQuotableWhenItsEchoComesBack() throws Exception {
        UUID client = UUID.randomUUID();
        postJson("{\"text\": \"Ok mình tới\", \"clientMessageId\": \"" + client + "\", \"replyToMessageId\": \""
                + messageId("m-1") + "\"}").andExpect(status().isCreated());
        String external = jdbc.queryForObject("select external_message_id from message where client_message_id = ?",
                String.class, client);
        UUID sent = messageId(external);

        // Before the echo: stored as Sino wrote it, no cliMsgId, so it cannot be quoted yet.
        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.items[?(@.text == 'Ok mình tới')].canQuote").value(false));
        postJson("{\"text\": \"Nữa\", \"clientMessageId\": \"" + UUID.randomUUID() + "\", \"replyToMessageId\": \""
                + sent + "\"}").andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("QUOTE_UNAVAILABLE"));

        // The echo of our own message brings the keys, and says nothing of the quote Sino already showed.
        transactions.executeWithoutResult(t -> store.store(account, batch(new NormalizedMessage(external, "8001",
                ME.externalParticipantId(), MessageDirection.OUTBOUND, MessageType.TEXT, "Ok mình tới",
                MessageStatus.SENT, true, "m-1", MONDAY.plusSeconds(120), List.of(), REACTABLE, null, null))));

        assertThat(jdbc.queryForObject("select count(*) from message where external_message_id = ?", Long.class,
                external)).isOne();
        assertThat(jdbc.queryForObject("select metadata::text from message where id = ?", String.class, sent))
                .contains("\"cliMsgId\"").contains("\"quoteText\"").contains("Chiều nay họp");
        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.items[?(@.text == 'Ok mình tới')].canQuote").value(true))
                .andExpect(jsonPath("$.items[?(@.text == 'Ok mình tới')].quote.text").value("Chiều nay họp"));
        postJson("{\"text\": \"Nữa\", \"clientMessageId\": \"" + UUID.randomUUID() + "\", \"replyToMessageId\": \""
                + sent + "\"}").andExpect(status().isCreated());
    }

    @Test
    void aMessageThatCannotBeQuotedIsRefusedAndNothingIsWritten() throws Exception {
        postJson("{\"text\": \"Ok\", \"clientMessageId\": \"" + UUID.randomUUID() + "\", \"replyToMessageId\": \""
                + messageId("m-2") + "\"}").andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("QUOTE_UNAVAILABLE"));

        assertThat(chat.sentMessages()).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from message where client_message_id is not null",
                Long.class)).isZero();
    }

    @Test
    void aMessageOutsideTheConversationCannotBeQuoted() throws Exception {
        postJson("{\"text\": \"Ok\", \"clientMessageId\": \"" + UUID.randomUUID() + "\", \"replyToMessageId\": \""
                + UUID.randomUUID() + "\"}").andExpect(status().isNotFound());

        assertThat(chat.sentMessages()).isEmpty();
    }

    @Test
    void aReplyWithoutAQuoteHasNoQuote() throws Exception {
        postJson("{\"text\": \"Ok\", \"clientMessageId\": \"" + UUID.randomUUID() + "\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.quote").value(nullValue()));

        assertThat(chat.sentMessages()).singleElement().satisfies(command -> assertThat(command.quote()).isNull());
    }

    private ResultActions react(UUID messageId, String code) throws Exception {
        return mvc.perform(put(reactionUrl(messageId)).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"code\": \"" + code + "\"}"));
    }

    private String reactionUrl(UUID messageId) {
        return "/api/conversations/" + conversation + "/messages/" + messageId + "/reaction";
    }

    private ResultActions postJson(String json) throws Exception {
        return mvc.perform(post("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test"))
                .with(csrf()).contentType(APPLICATION_JSON).content(json));
    }

    private UUID messageId(String external) {
        return jdbc.queryForObject("select id from message where external_message_id = ?", UUID.class, external);
    }

    private static SyncBatch batch(NormalizedMessage... messages) {
        NormalizedConversation thread = new NormalizedConversation("8001", ConversationType.DIRECT, "An", null,
                List.of(FRIEND, ME), null);
        return new SyncBatch(List.of(thread), List.of(messages), List.of(), new SyncCursor("next"), false);
    }

    private static NormalizedMessage inbound(String id, String text, Map<String, String> metadata) {
        return new NormalizedMessage(id, "8001", FRIEND.externalParticipantId(), MessageDirection.INBOUND,
                MessageType.TEXT, text, MessageStatus.UNKNOWN, false, null,
                MONDAY.plusSeconds("m-1".equals(id) ? 0 : 60), List.of(), metadata, null, null);
    }

}
