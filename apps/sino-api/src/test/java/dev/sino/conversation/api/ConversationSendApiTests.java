package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;

import com.jayway.jsonpath.JsonPath;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.AccountStatus;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.SentMessages;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderType;
import dev.sino.provider.SendingProviders;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * Replying from Sino (F10, BE-59, D-131…D-133): {@code POST} and {@code DELETE} of
 * {@code /api/conversations/{id}/messages}, on the whole application and a real PostgreSQL, with a fake connector
 * that sends or fails as each test tells it.
 */
@SpringBootTest(properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, SendingProviders.class })
@ActiveProfiles("test")
@RecordApplicationEvents
class ConversationSendApiTests {

    private static final Instant MONDAY = Instant.parse("2026-10-05T08:00:00Z");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice", null,
            false);
    private static final NormalizedParticipant ME = new NormalizedParticipant("me@mail.test", "Me", null, true);
    private static final Set<String> READ_ONLY = Set.of("openid", SendingProviders.READ_SCOPE);
    private static final Set<String> READ_AND_SEND = Set.of("openid", SendingProviders.READ_SCOPE,
            SendingProviders.SEND_SCOPE);
    private static final String TEXT = "Em nhận được rồi, cảm ơn chị.";

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
    @Qualifier("mailProvider")
    private FakeMessageProvider mail;

    @Autowired
    private ApplicationEvents events;

    @Autowired
    private SentMessages sentMessages;

    private UUID owner;
    private UUID account;
    private UUID conversation;
    private final UUID clientMessageId = UUID.randomUUID();

    @BeforeEach
    void aConversationWithAMessageFromAlice() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        mail.forgetSends();
        account = connect(READ_AND_SEND, "1//sample");
        store(inbound("m-1", ALICE));
        conversation = jdbc.queryForObject("select id from conversation where account_id = ?", UUID.class, account);
    }

    @Test
    void aReplyGoesOutAndComesBackAsTheStoredMessage() throws Exception {
        send(TEXT, clientMessageId).andExpect(status().isCreated())
                .andExpect(jsonPath("$.direction").value("OUTBOUND"))
                .andExpect(jsonPath("$.status").value("SENT"))
                .andExpect(jsonPath("$.clientMessageId").value(clientMessageId.toString()))
                .andExpect(jsonPath("$.text").value(TEXT))
                .andExpect(jsonPath("$.to[0].address").value("alice@example.test"))
                .andExpect(jsonPath("$.sender.self").value(true));

        assertThat(mail.sentMessages()).singleElement().satisfies(command -> {
            assertThat(command.externalConversationId()).isEqualTo("thread");
            assertThat(command.textContent()).isEqualTo(TEXT);
            assertThat(command.replyToExternalMessageId()).isEqualTo("m-1");
            assertThat(command.to()).containsExactly(new Address("Alice", "alice@example.test"));
            assertThat(command.clientMessageId()).isEqualTo(clientMessageId);
        });
        assertThat(stored()).containsExactly(Map.of("external_message_id", "sent-1", "status", "SENT",
                "client_message_id", clientMessageId));
        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.items[0].clientMessageId").value(clientMessageId.toString()))
                .andExpect(jsonPath("$.items[1].clientMessageId").value(nullValue()));
        assertThat(events.stream(ConversationChanged.class)).anySatisfy(
                event -> assertThat(event.conversationId()).isEqualTo(conversation));
    }

    // The name the account writes in mail it sent itself, as the people it writes to know it (BE-62).
    @Test
    void aReplyGoesWithTheNameTheAccountWritesInItsOwnMail() throws Exception {
        store(outbound("m-0"));

        send(TEXT, clientMessageId).andExpect(status().isCreated());

        assertThat(mail.sentMessages()).singleElement()
                .satisfies(command -> assertThat(command.senderName()).isEqualTo("Me"));
    }

    // The user renamed themselves: the name of the latest mail they sent, whatever the conversation.
    @Test
    void theNameOfTheLatestMailTheAccountSentIsTheOne() throws Exception {
        store(outbound("m-0"));
        NormalizedParticipant renamed = new NormalizedParticipant("me@mail.test", "Me Later", null, true);
        NormalizedConversation other = new NormalizedConversation("thread-2", ConversationType.THREAD, "Khác", null,
                List.of(ALICE, renamed), null);
        NormalizedMessage later = new NormalizedMessage("m-9", "thread-2", renamed.externalParticipantId(),
                MessageDirection.OUTBOUND, MessageType.TEXT, "Gửi chị", MessageStatus.SENT, true, null,
                MONDAY.minusSeconds(60), List.of(), Map.of(), null, null);
        transactions.executeWithoutResult(t -> store.store(account, new SyncBatch(List.of(other), List.of(later),
                List.of(), new SyncCursor("next"), false)));

        send(TEXT, clientMessageId).andExpect(status().isCreated());

        assertThat(mail.sentMessages()).singleElement()
                .satisfies(command -> assertThat(command.senderName()).isEqualTo("Me Later"));
    }

    // A reply Sino sent writes no name of its own: only mail the account sent itself counts.
    @Test
    void withoutMailTheAccountSentItselfAReplyGoesWithoutAName() throws Exception {
        send(TEXT, clientMessageId).andExpect(status().isCreated());
        send(TEXT, UUID.randomUUID()).andExpect(status().isCreated());

        assertThat(mail.sentMessages()).extracting(SendMessageCommand::senderName).containsExactly(null, null);
    }

    // The user clicked again, or the network repeated the request: one message, sent once (D-131).
    @Test
    void theSameMessageIsNeverSentTwice() throws Exception {
        String first = send(TEXT, clientMessageId).andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString();

        send(TEXT, clientMessageId).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(JsonPath.<String>read(first, "$.id")));

        assertThat(mail.sentMessages()).hasSize(1);
    }

    @Test
    void aMessageBeingSentIsNotSentAgain() throws Exception {
        jdbc.update("""
                insert into message (conversation_id, external_message_id, direction, type, text_content, status,
                                     sent_at, is_read, provider_read, client_message_id, body_format,
                                     created_at, updated_at)
                values (?, ?, 'OUTBOUND', 'TEXT', ?, 'PENDING', now(), true, true, ?, 'TEXT', now(), now())
                """, conversation, "sino:" + clientMessageId, TEXT, clientMessageId);

        send(TEXT, clientMessageId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SEND_IN_PROGRESS"));

        assertThat(mail.sentMessages()).isEmpty();
    }

    @Test
    void withoutPermissionNothingIsWrittenOrSent() throws Exception {
        credentials.save(account, new OAuth2Credentials("ya29.sample", null, READ_ONLY), "1//sample");

        send(TEXT, clientMessageId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REPLY_NOT_ALLOWED"))
                .andExpect(jsonPath("$.state").value("NEEDS_PERMISSION"));

        assertThat(mail.sentMessages()).isEmpty();
        assertThat(stored()).isEmpty();
    }

    // The provider said no, so the message did not go: it stays, and the same ID sends it again.
    @ParameterizedTest
    @EnumSource(value = ProviderErrorCode.class, names = { "REQUEST_REJECTED", "RATE_LIMITED", "PROVIDER_UNAVAILABLE" })
    void aRefusedMessageFailsAndCanBeSentAgain(ProviderErrorCode code) throws Exception {
        mail.failNextSends(new ProviderException(code, "no"));

        String failed = send(TEXT, clientMessageId).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("SEND_FAILED"))
                .andReturn().getResponse().getContentAsString();
        String messageId = JsonPath.read(failed, "$.messageId");
        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("FAILED"));

        send(TEXT, clientMessageId).andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(messageId))
                .andExpect(jsonPath("$.status").value("SENT"));
        assertThat(mail.sentMessages()).hasSize(2);
        assertThat(mail.sentMessages().getLast().replyToExternalMessageId())
                .as("the message it answers is Alice's, not the one that failed").isEqualTo("m-1");
        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("SENT"));
    }

    // The provider may have sent it: asking again later is the only safe move (D-132).
    @Test
    void aMessageWhoseOutcomeIsUnknownIsNeverSentAgainBlindly() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));

        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.code").value("SEND_OUTCOME_UNKNOWN"))
                .andExpect(jsonPath("$.messageId").isNotEmpty());
        send(TEXT, clientMessageId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SEND_OUTCOME_UNKNOWN"));

        assertThat(mail.sentMessages()).hasSize(1);
        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("UNKNOWN"));
    }

    // No refresh token, so Sino cannot try again with a new access token: the account must be reconnected.
    @Test
    void aRefusedGrantFailsTheMessageAndAsksForAReconnect() throws Exception {
        credentials.save(account, new OAuth2Credentials("ya29.sample", null, READ_AND_SEND), null);
        mail.failNextSends(new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "revoked"));

        send(TEXT, clientMessageId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REPLY_NOT_ALLOWED"))
                .andExpect(jsonPath("$.state").value("ACCOUNT_UNAVAILABLE"));

        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("FAILED"));
        assertThat(accounts.findById(account).orElseThrow().status()).isEqualTo(AccountStatus.AUTH_EXPIRED);
    }

    @Test
    void withNobodyToReplyToNothingIsWrittenOrSent() throws Exception {
        jdbc.update("update message set sender_participant_id = null");

        send(TEXT, clientMessageId).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("REPLY_NO_RECIPIENT"));

        assertThat(mail.sentMessages()).isEmpty();
        assertThat(stored()).isEmpty();
    }

    // Sync read the message from the provider before the send was written down: still one message.
    @Test
    void aSentMessageThatSyncAlreadyBroughtInStaysOneMessage() throws Exception {
        store(new NormalizedMessage("sent-1", "thread", ME.externalParticipantId(), MessageDirection.OUTBOUND,
                MessageType.TEXT, TEXT, MessageStatus.SENT, true, null, MONDAY.plusSeconds(60), List.of(), Map.of(),
                null, null));

        send(TEXT, clientMessageId).andExpect(status().isCreated())
                .andExpect(jsonPath("$.clientMessageId").value(clientMessageId.toString()));

        assertThat(stored()).containsExactly(Map.of("external_message_id", "sent-1", "status", "SENT",
                "client_message_id", clientMessageId));
    }

    @ParameterizedTest
    @ValueSource(strings = { "{\"text\": \"\", \"clientMessageId\": \"%s\"}",
            "{\"text\": \"   \", \"clientMessageId\": \"%s\"}", "{\"clientMessageId\": \"%s\"}",
            "{\"text\": \"ok\"}" })
    void aMessageNeedsTextAndAnId(String body) throws Exception {
        mvc.perform(post("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content(body.formatted(clientMessageId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(mail.sentMessages()).isEmpty();
    }

    @Test
    void aMessageHasAtMostAHundredThousandCharactersAndAnIdThatIsAUuid() throws Exception {
        send("a".repeat(100_001), clientMessageId).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(post("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"text\": \"ok\", \"clientMessageId\": \"not-a-uuid\"}"))
                .andExpect(status().isBadRequest());
        send("a".repeat(100_000), clientMessageId).andExpect(status().isCreated());
    }

    @Test
    void sendingNeedsTheCsrfToken() throws Exception {
        mvc.perform(post("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test"))
                .contentType(APPLICATION_JSON).content(body(TEXT, clientMessageId)))
                .andExpect(status().isForbidden());

        assertThat(mail.sentMessages()).isEmpty();
    }

    @Test
    void aConversationOutOfReachIsNotFound() throws Exception {
        mvc.perform(post("/api/conversations/{id}/messages", UUID.randomUUID()).with(user("owner@sino.test"))
                .with(csrf()).contentType(APPLICATION_JSON).content(body(TEXT, clientMessageId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CONVERSATION_NOT_FOUND"));
    }

    @Test
    void aFailedMessageCanBeDiscarded() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"));
        String messageId = JsonPath.read(send(TEXT, clientMessageId).andReturn().getResponse().getContentAsString(),
                "$.messageId");

        discard(messageId).andExpect(status().isNoContent());

        assertThat(stored()).isEmpty();
        assertThat(events.stream(ConversationChanged.class)).isNotEmpty();
    }

    @Test
    void onlyAFailedMessageSinoSentCanBeDiscarded() throws Exception {
        String sent = JsonPath.read(send(TEXT, clientMessageId).andReturn().getResponse().getContentAsString(), "$.id");
        String fromAlice = jdbc.queryForObject("select id from message where external_message_id = 'm-1'",
                String.class);

        discard(sent).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MESSAGE_NOT_DELETABLE"));
        discard(fromAlice).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_DELETABLE"));
        discard(UUID.randomUUID().toString()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"));
    }

    // D-132: the next sync of the account asks the provider about a message whose outcome is unknown.
    // Gmail gives what it sends its own Message-ID (BE-60): the provider gets what was sent and when the send started,
    // to look for it in the thread by its text (D-132).
    @Test
    void theProviderIsToldWhatWasSentAndWhenTheSendStarted() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());
        Instant started = jdbc.queryForObject("select sent_at from message where client_message_id = ?",
                Timestamp.class, clientMessageId).toInstant();

        sentMessages.reconcile(account);

        assertThat(mail.searchedAttempts()).singleElement().satisfies(search -> {
            assertThat(search.command().externalConversationId()).isEqualTo("thread");
            assertThat(search.command().textContent()).isEqualTo(TEXT);
            assertThat(search.command().replyToExternalMessageId()).isEqualTo("m-1");
            assertThat(search.command().to()).containsExactly(new Address("Alice", "alice@example.test"));
            assertThat(search.command().clientMessageId()).isEqualTo(clientMessageId);
            assertThat(search.startedAt()).isEqualTo(started);
        });
    }

    // The user typed the same text again after the first send went unknown, and that one went: the provider finds it
    // for both, but it is the second one's, and it stays so (review BE-60).
    @Test
    void aMessageAnotherReplyHoldsIsNotTakenForThisOne() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());
        UUID retyped = UUID.randomUUID();
        send(TEXT, retyped).andExpect(status().isCreated());
        String theirs = externalIdOf(retyped);
        mail.found(clientMessageId, theirs);

        sentMessages.reconcile(account);

        assertThat(jdbc.queryForObject("select status from message where client_message_id = ?", String.class,
                clientMessageId)).isEqualTo("UNKNOWN");
        assertThat(externalIdOf(retyped)).isEqualTo(theirs);

        mail.found(clientMessageId, theirs, "gm-9");
        sentMessages.reconcile(account);

        assertThat(externalIdOf(clientMessageId)).isEqualTo("gm-9");
        assertThat(externalIdOf(retyped)).isEqualTo(theirs);
    }

    // A message sent again after it failed is looked for from that send on, not from the first one.
    @Test
    void aMessageSentAgainIsLookedForFromWhenItWasSentAgain() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"));
        send(TEXT, clientMessageId).andExpect(status().isBadGateway());
        jdbc.update("""
                update message set sent_at = now() - interval '1 hour', created_at = now() - interval '1 hour'
                where client_message_id = ?
                """, clientMessageId);
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());
        Instant sentAgain = jdbc.queryForObject("select sent_at from message where client_message_id = ?",
                Timestamp.class, clientMessageId).toInstant();

        sentMessages.reconcile(account);

        assertThat(mail.searchedAttempts()).singleElement()
                .satisfies(search -> assertThat(search.startedAt()).isEqualTo(sentAgain)
                        .isAfter(Instant.now().minusSeconds(60)));
    }

    @Test
    void anUnknownMessageTheProviderHasBecomesSent() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());
        mail.sent(clientMessageId, "gm-9");

        sentMessages.reconcile(account);

        assertThat(mail.searchedSends()).containsExactly(clientMessageId);
        assertThat(stored()).containsExactly(Map.of("external_message_id", "gm-9", "status", "SENT",
                "client_message_id", clientMessageId));
        assertThat(events.stream(ConversationChanged.class)).isNotEmpty();
    }

    @Test
    void anUnknownMessageTheProviderDoesNotHaveFailsAfterTenMinutes() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());

        sentMessages.reconcile(account);
        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("UNKNOWN"));

        jdbc.update("update message set sent_at = now() - interval '11 minutes' where client_message_id = ?",
                clientMessageId);
        sentMessages.reconcile(account);
        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("FAILED"));
        send(TEXT, clientMessageId).andExpect(status().isCreated());
    }

    @Test
    void anUnknownMessageThatSyncAlreadyBroughtInStaysOneMessage() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());
        store(new NormalizedMessage("gm-9", "thread", ME.externalParticipantId(), MessageDirection.OUTBOUND,
                MessageType.TEXT, TEXT, MessageStatus.SENT, true, null, MONDAY.plusSeconds(60), List.of(), Map.of(),
                null, null));
        mail.sent(clientMessageId, "gm-9");

        sentMessages.reconcile(account);

        assertThat(stored()).containsExactly(Map.of("external_message_id", "gm-9", "status", "SENT",
                "client_message_id", clientMessageId));
    }

    // A send that never wrote what came of it, because the backend stopped meanwhile: no longer "being sent".
    @Test
    void aMessageLeftPendingIsCheckedOnceItIsFiveMinutesOld() {
        // A send retried after a refused token reads the profile, the message and sends twice: over a minute.
        pending(clientMessageId, "now() - interval '2 minutes'");
        sentMessages.reconcile(account);
        assertThat(mail.searchedSends()).as("a send may still be running").isEmpty();

        jdbc.update("update message set sent_at = now() - interval '6 minutes' where client_message_id = ?",
                clientMessageId);
        sentMessages.reconcile(account);
        assertThat(mail.searchedSends()).containsExactly(clientMessageId);
        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("UNKNOWN"));

        jdbc.update("update message set sent_at = now() - interval '11 minutes' where client_message_id = ?",
                clientMessageId);
        sentMessages.reconcile(account);
        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("FAILED"));
    }

    // Without a way to ask, giving up would let "send again" send a second message: it stays unknown.
    @Test
    void aMessageAConnectorCannotLookUpNeverFails() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());
        mail.findsSends(false);
        jdbc.update("update message set sent_at = now() - interval '11 minutes' where client_message_id = ?",
                clientMessageId);
        UUID stuck = UUID.randomUUID();
        pending(stuck, "now() - interval '11 minutes'");

        sentMessages.reconcile(account);

        assertThat(stored()).extracting(row -> row.get("status")).as("no longer being sent, still not failed")
                .containsOnly("UNKNOWN").hasSize(2);
    }

    // Pausing the sync must not keep a send unsettled: the sweep does not wait for a sync.
    @Test
    void theSweepSettlesTheSendsOfAPausedAccountButLeavesOneToReconnect() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());
        jdbc.update("update connected_account set sync_enabled = false where id = ?", account);
        mail.sent(clientMessageId, "gm-9");

        sentMessages.reconcileAll();

        assertThat(stored()).singleElement().satisfies(row -> assertThat(row.get("status")).isEqualTo("SENT"));

        UUID another = UUID.randomUUID();
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, another).andExpect(status().isGatewayTimeout());
        ConnectedAccount found = accounts.findById(account).orElseThrow();
        found.markAuthExpired();
        accounts.save(found);
        mail.forgetSends();

        sentMessages.reconcileAll();

        assertThat(mail.searchedSends()).as("the provider would refuse: the account must be reconnected").isEmpty();
    }

    // A reply that did not go leaves the conversation waiting for one; a sent one is its latest message.
    @Test
    void onlyASentReplyAnswersTheConversation() throws Exception {
        mail.failNextSends(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"));
        send(TEXT, clientMessageId).andExpect(status().isBadGateway());

        conversationRow().andExpect(jsonPath("$.needsReply").value(true))
                .andExpect(jsonPath("$.snippet").value("Gửi em báo cáo"));

        send(TEXT, clientMessageId).andExpect(status().isCreated());

        conversationRow().andExpect(jsonPath("$.needsReply").value(false))
                .andExpect(jsonPath("$.snippet").value(TEXT));
    }

    // The second request comes while the first one is with the provider: one message, sent once.
    @Test
    void twoSendsOfTheSameMessageAtOnceSendItOnce() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        mail.holdNextSend(entered, release);
        CompletableFuture<Integer> first = CompletableFuture.supplyAsync(() -> {
            try {
                return send(TEXT, clientMessageId).andReturn().getResponse().getStatus();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();

        send(TEXT, clientMessageId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SEND_IN_PROGRESS"));
        release.countDown();

        assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(201);
        assertThat(mail.sentMessages()).hasSize(1);
    }

    // Unicode spaces are blank too: refused as such, not let through to fail later.
    @Test
    void textOfOnlyUnicodeSpacesIsRefused() throws Exception {
        send("  ", clientMessageId).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(mail.sentMessages()).isEmpty();
    }

    @Test
    void onlyTheMessagesOfTheAccountAreChecked() throws Exception {
        // Another account of the same provider, with a send of its own that got no answer.
        UUID other = accounts.save(ConnectedAccount.register(owner, ProviderType.of(SendingProviders.MAIL),
                "other@mail.test", "Other", null, null)).id();
        credentials.save(other, new OAuth2Credentials("ya29.other", null, READ_AND_SEND), "1//other");
        UUID otherConversation = jdbc.queryForObject("""
                insert into conversation (account_id, external_conversation_id, type, last_message_at, created_at,
                                          updated_at)
                values (?, 'other-thread', 'THREAD', now(), now(), now()) returning id
                """, UUID.class, other);
        UUID othersMessage = UUID.randomUUID();
        jdbc.update("""
                insert into message (conversation_id, external_message_id, direction, type, text_content, status,
                                     sent_at, is_read, provider_read, client_message_id, body_format,
                                     created_at, updated_at)
                values (?, ?, 'OUTBOUND', 'TEXT', 'ok', 'UNKNOWN', now() - interval '11 minutes', true, true, ?,
                        'TEXT', now(), now())
                """, otherConversation, "sino:" + othersMessage, othersMessage);
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        send(TEXT, clientMessageId).andExpect(status().isGatewayTimeout());

        sentMessages.reconcile(account);

        // Asked in this account's mailbox, the other one's message would not be found, then fail and be sent twice.
        assertThat(mail.searchedSends()).containsExactly(clientMessageId);
        assertThat(jdbc.queryForObject("select status from message where client_message_id = ?", String.class,
                othersMessage)).isEqualTo("UNKNOWN");
    }

    private void pending(UUID id, String sentAt) {
        jdbc.update("""
                insert into message (conversation_id, external_message_id, direction, type, text_content, status,
                                     sent_at, is_read, provider_read, client_message_id, body_format,
                                     created_at, updated_at)
                values (?, ?, 'OUTBOUND', 'TEXT', ?, 'PENDING', %s, true, true, ?, 'TEXT', now(), now())
                """.formatted(sentAt), conversation, "sino:" + id, TEXT, id);
    }

    private ResultActions send(String text, UUID id) throws Exception {
        return mvc.perform(post("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test"))
                .with(csrf()).contentType(APPLICATION_JSON).content(body(text, id)));
    }

    private ResultActions conversationRow() throws Exception {
        return mvc.perform(get("/api/conversations/{id}", conversation).with(user("owner@sino.test")));
    }

    private ResultActions discard(String messageId) throws Exception {
        return mvc.perform(delete("/api/conversations/{id}/messages/{messageId}", conversation, messageId)
                .with(user("owner@sino.test")).with(csrf()));
    }

    private static String body(String text, UUID id) {
        return "{\"text\": \"" + text + "\", \"clientMessageId\": \"" + id + "\"}";
    }

    // The messages Sino sent in the conversation.
    private List<Map<String, Object>> stored() {
        return jdbc.queryForList("""
                select external_message_id, status, client_message_id from message
                where conversation_id = ? and direction = 'OUTBOUND' order by sent_at
                """, conversation);
    }

    private String externalIdOf(UUID sentWith) {
        return jdbc.queryForObject("select external_message_id from message where client_message_id = ?",
                String.class, sentWith);
    }

    private UUID connect(Set<String> scopes, String refreshToken) {
        UUID id = accounts.save(ConnectedAccount.register(owner, ProviderType.of(SendingProviders.MAIL),
                "me@mail.test", "Me", null, null)).id();
        credentials.save(id, new OAuth2Credentials("ya29.sample", null, scopes), refreshToken);
        return id;
    }

    private void store(NormalizedMessage message) {
        NormalizedConversation thread = new NormalizedConversation("thread", ConversationType.THREAD, "Báo cáo",
                null, List.of(ALICE, ME), null);
        transactions.executeWithoutResult(t -> store.store(account, new SyncBatch(List.of(thread),
                List.of(message), List.of(), new SyncCursor("next"), false)));
    }

    // Sent by the account from another mail client, before Alice wrote.
    private static NormalizedMessage outbound(String id) {
        return new NormalizedMessage(id, "thread", ME.externalParticipantId(), MessageDirection.OUTBOUND,
                MessageType.TEXT, "Chị gửi em báo cáo nhé", MessageStatus.SENT, true, null, MONDAY.minusSeconds(3_600),
                List.of(), Map.of(), null, null);
    }

    private static NormalizedMessage inbound(String id, NormalizedParticipant from) {
        return new NormalizedMessage(id, "thread", from.externalParticipantId(), MessageDirection.INBOUND,
                MessageType.TEXT, "Gửi em báo cáo", MessageStatus.UNKNOWN, false, null, MONDAY, List.of(), Map.of(),
                null, null);
    }

}
