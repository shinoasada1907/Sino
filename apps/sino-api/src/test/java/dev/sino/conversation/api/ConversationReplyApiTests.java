package dev.sino.conversation.api;

import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;
import dev.sino.provider.SendingProviders;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.NormalizedRecipients;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * Whether the user can reply in a conversation, and to whom (F10, D-130, D-133): {@code reply} of
 * {@code GET /api/conversations/{id}}, on the whole application and a real PostgreSQL, with connectors that send or
 * not.
 */
@SpringBootTest(properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, SendingProviders.class })
@ActiveProfiles("test")
class ConversationReplyApiTests {

    private static final Instant MONDAY = Instant.parse("2026-10-05T08:00:00Z");
    private static final Instant TUESDAY = Instant.parse("2026-10-06T08:00:00Z");
    private static final Instant WEDNESDAY = Instant.parse("2026-10-07T08:00:00Z");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice", null,
            false);
    private static final NormalizedParticipant BOB = new NormalizedParticipant("bob@example.test", "Bob", null, false);
    private static final NormalizedParticipant ME = new NormalizedParticipant("me@mail.test", "Me", null, true);
    private static final Set<String> READ_ONLY = Set.of("openid", SendingProviders.READ_SCOPE);
    private static final Set<String> READ_AND_SEND = Set.of("openid", SendingProviders.READ_SCOPE,
            SendingProviders.SEND_SCOPE);

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

    private UUID owner;

    @BeforeEach
    void startFromAnEmptyInbox() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    @Test
    void anAccountThatGrantedTheSendScopeIsReadyToReplyToTheSender() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, inbound("m-1", ALICE, MONDAY, null));

        reply(account).andExpect(status().isOk())
                .andExpect(jsonPath("$.reply.state").value("READY"))
                .andExpect(jsonPath("$.reply.to[0].name").value("Alice"))
                .andExpect(jsonPath("$.reply.to[0].address").value("alice@example.test"))
                .andExpect(jsonPath("$.reply.to.length()").value(1));
    }

    @Test
    void anAccountThatGrantedOnlyReadingNeedsPermission() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_ONLY);
        store(account, inbound("m-1", ALICE, MONDAY, null));

        reply(account).andExpect(jsonPath("$.reply.state").value("NEEDS_PERMISSION"))
                .andExpect(jsonPath("$.reply.to[0].address").value("alice@example.test"));
    }

    @Test
    void anAccountWhoseAccessExpiredIsUnavailable() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, inbound("m-1", ALICE, MONDAY, null));
        ConnectedAccount found = accounts.findById(account).orElseThrow();
        found.markAuthExpired();
        accounts.save(found);

        reply(account).andExpect(jsonPath("$.reply.state").value("ACCOUNT_UNAVAILABLE"));
    }

    // An old account that expired and never granted sending: reconnecting fixes both, so it says reconnect.
    @Test
    void anExpiredAccountIsUnavailableEvenWithoutTheSendScope() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_ONLY);
        store(account, inbound("m-1", ALICE, MONDAY, null));
        ConnectedAccount found = accounts.findById(account).orElseThrow();
        found.markAuthExpired();
        accounts.save(found);

        reply(account).andExpect(jsonPath("$.reply.state").value("ACCOUNT_UNAVAILABLE"));
    }

    // Reconnecting would not help: the provider itself cannot send.
    @Test
    void aProviderThatCannotSendIsNotSupportedWhateverTheAccount() throws Exception {
        UUID account = connect(SendingProviders.READER, READ_AND_SEND);
        store(account, inbound("m-1", ALICE, MONDAY, null));
        ConnectedAccount found = accounts.findById(account).orElseThrow();
        found.markAuthExpired();
        accounts.save(found);

        reply(account).andExpect(jsonPath("$.reply.state").value("NOT_SUPPORTED"));
    }

    @Test
    void pausingTheSyncDoesNotStopReplies() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, inbound("m-1", ALICE, MONDAY, null));
        jdbc.update("update connected_account set sync_enabled = false where id = ?", account);

        reply(account).andExpect(jsonPath("$.reply.state").value("READY"));
    }

    @Test
    void aReplyGoesWhereTheSenderAsked() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, inbound("m-1", ALICE, MONDAY, recipients(List.of(new Address("Hỗ trợ", "hotro@example.test"),
                new Address(null, "help@example.test")))));

        reply(account).andExpect(jsonPath("$.reply.to.length()").value(2))
                .andExpect(jsonPath("$.reply.to[0].name").value("Hỗ trợ"))
                .andExpect(jsonPath("$.reply.to[0].address").value("hotro@example.test"))
                .andExpect(jsonPath("$.reply.to[1].name").value(nullValue()))
                .andExpect(jsonPath("$.reply.to[1].address").value("help@example.test"));
    }

    // Stored before Sino read addressees (recipients unknown), or without a Reply-To header (empty).
    @Test
    void withoutAReplyToTheReplyGoesToTheSender() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, inbound("m-1", ALICE, MONDAY, recipients(List.of())));
        reply(account).andExpect(jsonPath("$.reply.to[0].address").value("alice@example.test"));

        jdbc.update("update message set recipients = null");
        reply(account).andExpect(jsonPath("$.reply.to[0].address").value("alice@example.test"))
                .andExpect(jsonPath("$.reply.to.length()").value(1));
    }

    @Test
    void theNewestIncomingMessageDecidesEvenAfterTheUserReplied() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, inbound("m-1", BOB, MONDAY, null), inbound("m-2", ALICE, TUESDAY, null),
                outbound("m-3", WEDNESDAY, List.of(new Address("Carol", "carol@example.test"))));

        reply(account).andExpect(jsonPath("$.reply.to.length()").value(1))
                .andExpect(jsonPath("$.reply.to[0].address").value("alice@example.test"));
    }

    @Test
    void aConversationOfOnlyOutgoingMessagesRepliesToWhomTheNewestWent() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, outbound("m-1", MONDAY, List.of(new Address("Bob", "bob@example.test"))),
                outbound("m-2", TUESDAY, List.of(new Address("Carol", "carol@example.test"),
                        new Address(null, "dan@example.test"))));

        reply(account).andExpect(jsonPath("$.reply.to.length()").value(2))
                .andExpect(jsonPath("$.reply.to[0].address").value("carol@example.test"))
                .andExpect(jsonPath("$.reply.to[1].address").value("dan@example.test"));
    }

    @Test
    void anOutgoingMessageWhoseAddresseesSinoDoesNotKnowLeavesNobody() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, outbound("m-1", MONDAY, List.of(new Address("Bob", "bob@example.test"))));
        jdbc.update("update message set recipients = null");

        reply(account).andExpect(jsonPath("$.reply.to", empty()));
    }

    @Test
    void withNobodyToReplyToTheListIsEmpty() throws Exception {
        UUID account = connect(SendingProviders.MAIL, READ_AND_SEND);
        store(account, inbound("m-1", null, MONDAY, null));

        reply(account).andExpect(jsonPath("$.reply.state").value("READY"))
                .andExpect(jsonPath("$.reply.to", empty()));
    }

    private ResultActions reply(UUID account) throws Exception {
        UUID conversation = jdbc.queryForObject("select id from conversation where account_id = ?", UUID.class,
                account);
        return mvc.perform(get("/api/conversations/{id}", conversation).with(user("owner@sino.test")));
    }

    private UUID connect(String provider, Set<String> scopes) {
        UUID id = accounts.save(ConnectedAccount.register(owner, ProviderType.of(provider), "me@mail.test", "Me",
                null, null)).id();
        credentials.save(id, new OAuth2Credentials("ya29.sample", null, scopes), "1//sample");
        return id;
    }

    private void store(UUID account, NormalizedMessage... messages) {
        NormalizedConversation thread = new NormalizedConversation("thread", ConversationType.THREAD, "Báo cáo",
                null, List.of(ALICE, BOB, ME), null);
        transactions.executeWithoutResult(t -> store.store(account, new SyncBatch(List.of(thread), List.of(messages),
                List.of(), new SyncCursor("next"), false)));
    }

    private static NormalizedMessage inbound(String id, NormalizedParticipant from, Instant at,
            NormalizedRecipients recipients) {
        return new NormalizedMessage(id, "thread", from == null ? null : from.externalParticipantId(),
                MessageDirection.INBOUND, MessageType.TEXT, "Thư " + id, MessageStatus.UNKNOWN, false, null, at,
                List.of(), Map.of(), recipients, null);
    }

    private static NormalizedMessage outbound(String id, Instant at, List<Address> to) {
        return new NormalizedMessage(id, "thread", ME.externalParticipantId(), MessageDirection.OUTBOUND,
                MessageType.TEXT, "Thư " + id, MessageStatus.SENT, true, null, at, List.of(), Map.of(),
                new NormalizedRecipients(to, List.of(), List.of()), null);
    }

    private static NormalizedRecipients recipients(List<Address> replyTo) {
        return new NormalizedRecipients(List.of(new Address("Me", "me@mail.test")), List.of(), replyTo);
    }

}
