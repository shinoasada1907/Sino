package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.InboxIds;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderType;
import dev.sino.provider.SendingProviders;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * A thread found in two accounts of the owner is one row of the inbox (F05b, D-181…D-188): the user's own case, two
 * Gmail accounts that mail each other, so every mail between them is in both mailboxes. On the whole application and a
 * real PostgreSQL, the mail stored by the real {@link ConversationStore}, which groups the copies (BE-80).
 */
@SpringBootTest(properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, SendingProviders.class })
@ActiveProfiles("test")
@RecordApplicationEvents
class MergedThreadsApiTests {

    private static final Instant HELLLO = Instant.parse("2026-10-12T10:35:00Z");
    private static final Instant XIN_CHAO = Instant.parse("2026-10-12T10:37:00Z");
    private static final Instant HELLO = Instant.parse("2026-10-12T10:41:00Z");
    private static final Set<String> READ_AND_SEND = Set.of("openid", SendingProviders.READ_SCOPE,
            SendingProviders.SEND_SCOPE);
    private static final String TIEN_ADDRESS = "tienct07@gmail.com";
    private static final String SINON_ADDRESS = "bonzed2001@gmail.com";
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice", null,
            false);
    // Each account as the mailbox of the other one knows it.
    private static final NormalizedParticipant SINON = new NormalizedParticipant(SINON_ADDRESS, "Sinon sama", null,
            false);
    private static final NormalizedParticipant TIEN = new NormalizedParticipant(TIEN_ADDRESS, "Tiến", null, false);

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
    private InboxIds inboxIds;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    @Qualifier("mailProvider")
    private FakeMessageProvider mail;

    @Autowired
    private ApplicationEvents events;

    private UUID owner;
    private UUID tien;
    private UUID sinon;

    @BeforeEach
    void theOwnerHasTwoMailAccounts() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        mail.forgetSends();
        tien = connect(TIEN_ADDRESS, "Tiến");
        sinon = connect(SINON_ADDRESS, "Sinon sama");
    }

    // The thread "xin chào" of 17:41 (design, Context): three mails between the two accounts, in both mailboxes.
    // Gmail dates a copy when it reached the mailbox: the one that came in a little after the one that went. No reply
    // is needed: in the copy of Sinon, Sinon wrote last.
    @Test
    void aThreadInTwoAccountsIsOneRow() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);

        String body = list(get("/api/conversations"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(idOf(tien, "t-1").toString()))
                .andExpect(jsonPath("$.items[0].accountId").value(tien.toString()))
                .andExpect(jsonPath("$.items[0].accountIds", contains(tien.toString(), sinon.toString())))
                .andExpect(jsonPath("$.items[0].title").value("Sinon sama"))
                .andExpect(jsonPath("$.items[0].subject").value("xin chào"))
                .andExpect(jsonPath("$.items[0].snippet").value("hello"))
                .andExpect(jsonPath("$.items[0].lastMessageAt").value("2026-10-12T10:41:02Z"))
                .andExpect(jsonPath("$.items[0].unreadCount").value(1))
                .andExpect(jsonPath("$.items[0].needsReply").value(false))
                .andReturn().getResponse().getContentAsString();

        Map<String, Object> item = JsonPath.read(body, "$.items[0]");
        assertThat(item).containsKey("accountIds");
    }

    @Test
    void aThreadInOneAccountKeepsItsRowWithItsAccount() throws Exception {
        UUID id = store(tien, "t-1", inbound("t-1", "a-1", ALICE, "<a-1@mail.test>", HELLO, false));

        list(get("/api/conversations"))
                .andExpect(jsonPath("$.items[0].id").value(id.toString()))
                .andExpect(jsonPath("$.items[0].accountIds", contains(tien.toString())))
                .andExpect(jsonPath("$.items[0].title").value("Alice"))
                .andExpect(jsonPath("$.items[0].needsReply").value(true));
    }

    // D-181: the copy holding the newest message, whichever copy is the oldest; the oldest still names the group.
    @Test
    void thePrimaryCopyHoldsTheNewestMessage() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);
        store(sinon, "b-1", inbound("b-1", "b-cc", ALICE, "<cc@mail.test>", HELLO.plusSeconds(600), false));

        list(get("/api/conversations"))
                .andExpect(jsonPath("$.items[0].id")
                        .value(idOf(tien, "t-1").toString()))
                .andExpect(jsonPath("$.items[0].accountId").value(sinon.toString()))
                .andExpect(jsonPath("$.items[0].accountIds", contains(sinon.toString(), tien.toString())))
                .andExpect(jsonPath("$.items[0].title").value("Alice"))
                .andExpect(jsonPath("$.items[0].lastMessageAt").value("2026-10-12T10:51:00Z"));
    }

    // D-181: the newest message is in both copies; the copy it came in to wins over the older one it went from.
    @Test
    void whenBothHoldTheNewestMessageThePrimaryIsTheCopyItCameIn() throws Exception {
        UUID older = store(sinon, "b-1", outbound("b-1", "b-hello", SINON_ADDRESS, "<hello@mail.test>", HELLO));
        store(tien, "t-1", inbound("t-1", "t-hello", SINON, "<hello@mail.test>", HELLO, false));

        list(get("/api/conversations"))
                .andExpect(jsonPath("$.items[0].id").value(older.toString()))
                .andExpect(jsonPath("$.items[0].accountId").value(tien.toString()))
                .andExpect(jsonPath("$.items[0].title").value("Sinon sama"));
    }

    // Gmail dates each copy on its own: the one that went may even read later than the one that came in.
    @Test
    void theCopyItCameInWinsEvenWhenTheOtherMailboxDatesItLater() throws Exception {
        store(sinon, "b-1", outbound("b-1", "b-hello", SINON_ADDRESS, "<hello@mail.test>", HELLO.plusSeconds(3)));
        store(tien, "t-1", inbound("t-1", "t-hello", SINON, "<hello@mail.test>", HELLO, false));

        list(get("/api/conversations"))
                .andExpect(jsonPath("$.items[0].accountId").value(tien.toString()))
                .andExpect(jsonPath("$.items[0].lastMessageAt").value("2026-10-12T10:41:03Z"));
    }

    // D-181: Alice wrote to both addresses; neither copy wins on the newest message, so the oldest copy does.
    @Test
    void withTheNewestMessageComingInToEveryCopyTheOldestCopyIsThePrimary() throws Exception {
        store(tien, "t-1", inbound("t-1", "t-a", ALICE, "<both@mail.test>", HELLO, false));
        store(sinon, "b-1", inbound("b-1", "b-a", ALICE, "<both@mail.test>", HELLO, false));

        list(get("/api/conversations"))
                .andExpect(jsonPath("$.items[0].accountId").value(tien.toString()))
                .andExpect(jsonPath("$.items[0].accountIds", contains(tien.toString(), sinon.toString())))
                .andExpect(jsonPath("$.items[0].needsReply").value(true));
    }

    // D-182: unread when a copy is, the largest count, not the sum; files when a copy has them.
    @Test
    void theFieldsOfARowComeFromEveryCopy() throws Exception {
        store(tien, "t-1", inbound("t-1", "t-a", ALICE, "<a@mail.test>", XIN_CHAO, false));
        store(sinon, "b-1", inbound("b-1", "b-a", ALICE, "<a@mail.test>", XIN_CHAO, false),
                inbound("b-1", "b-b", ALICE, "<b@mail.test>", HELLO, false, file()));

        list(get("/api/conversations"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].unreadCount").value(2))
                .andExpect(jsonPath("$.items[0].hasAttachments").value(true));
    }

    // D-182: archived only when every copy is; one copy back in the inbox brings the group back.
    @Test
    void aGroupIsArchivedOnlyWhenEveryCopyIs() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);
        jdbc.update("update conversation set archived = true where account_id = ?", tien);

        assertThat(ids(get("/api/conversations"))).containsExactly(idOf(tien, "t-1").toString());
        assertThat(ids(get("/api/conversations").param("view", "archived"))).isEmpty();

        jdbc.update("update conversation set archived = true where account_id = ?", sinon);

        assertThat(ids(get("/api/conversations"))).isEmpty();
        assertThat(ids(get("/api/conversations").param("view", "archived")))
                .containsExactly(idOf(tien, "t-1").toString());
    }

    // D-187: a group counts once, by the fields of its row; "xin chào" needs no reply, Sinon wrote last in its copy.
    @Test
    void theCountsCountAGroupOnce() throws Exception {
        store(tien, "t-1", inbound("t-1", "t-a", ALICE, "<a@mail.test>", HELLO, false, file()));
        store(sinon, "b-1", inbound("b-1", "b-a", ALICE, "<a@mail.test>", HELLO, false, file()));
        xinChao(tien, "t-2", false);
        xinChao(sinon, "b-2", true);

        mvc.perform(get("/api/conversations/counts").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(2))
                .andExpect(jsonPath("$.byProvider['" + SendingProviders.MAIL + "']").value(2))
                .andExpect(jsonPath("$.needsReply").value(1))
                .andExpect(jsonPath("$.withAttachments").value(1));
    }

    // D-187: a group is in the list of an account when one of its copies is.
    @Test
    void theAccountFilterKeepsAGroupWithACopyInTheAccount() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);
        store(tien, "t-2", inbound("t-2", "t-a", ALICE, "<only-tien@mail.test>", XIN_CHAO, false));

        list(get("/api/conversations").param("accountId", sinon.toString()))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(idOf(tien, "t-1").toString()))
                .andExpect(jsonPath("$.items[0].accountIds", contains(tien.toString(), sinon.toString())));
        assertThat(ids(get("/api/conversations").param("accountId", tien.toString()))).hasSize(2);
        assertThat(ids(get("/api/conversations").param("provider", SendingProviders.MAIL))).hasSize(2);
    }

    // Keyset paging on the time of the group and its ID: each group once, newest first.
    @Test
    void pagesThroughGroupsEachOnce() throws Exception {
        for (int n = 1; n <= 3; n++) {
            Instant at = HELLO.plusSeconds(60L * n);
            store(tien, "t-" + n, inbound("t-" + n, "t-m" + n, ALICE, "<m" + n + "@mail.test>", at, false));
            store(sinon, "b-" + n, inbound("b-" + n, "b-m" + n, ALICE, "<m" + n + "@mail.test>", at, false));
        }
        store(sinon, "b-9", inbound("b-9", "b-m9", ALICE, "<m9@mail.test>", HELLO.plusSeconds(120), false));

        List<String> seen = new ArrayList<>();
        String cursor = null;
        do {
            MockHttpServletRequestBuilder request = get("/api/conversations").param("limit", "1");
            if (cursor != null) {
                request.param("cursor", cursor);
            }
            String body = list(request).andReturn().getResponse().getContentAsString();
            seen.addAll(JsonPath.<List<String>>read(body, "$.items[*].id"));
            cursor = JsonPath.read(body, "$.nextCursor");
        } while (cursor != null && seen.size() < 10);

        assertThat(seen).containsExactly(idOf(tien, "t-3").toString(), maxOf(idOf(tien, "t-2"), idOf(sinon, "b-9")),
                minOf(idOf(tien, "t-2"), idOf(sinon, "b-9")), idOf(tien, "t-1").toString());
    }

    // D-183: an old link to the other copy opens the group under its own ID.
    @Test
    void anyCopyOpensTheGroup() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);

        mvc.perform(get("/api/conversations/{id}", idOf(sinon, "b-1")).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(idOf(tien, "t-1").toString()))
                .andExpect(jsonPath("$.accountIds", contains(tien.toString(), sinon.toString())));
    }

    // Each address once, every account of the owner is self, in the order first stored.
    @Test
    void theParticipantsOfAGroupAreThoseOfEveryCopy() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);
        store(sinon, "b-1", inbound("b-1", "b-cc", ALICE, "<cc@mail.test>", HELLO.plusSeconds(600), false));

        mvc.perform(get("/api/conversations/{id}", idOf(tien, "t-1")).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participants[*].externalId", contains(SINON_ADDRESS, TIEN_ADDRESS,
                        "alice@example.test")))
                .andExpect(jsonPath("$.participants[*].self", contains(true, true, false)))
                .andExpect(jsonPath("$.participants[0].name").value("Sinon sama"));
    }

    // D-185: through the ID of either copy, both are archived and the group leaves the inbox.
    @Test
    void archivingAGroupArchivesEveryCopy() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);

        change(idOf(sinon, "b-1"), "{\"archived\": true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(idOf(tien, "t-1").toString()))
                .andExpect(jsonPath("$.archived").value(true));

        assertThat(jdbc.queryForList("select archived from conversation order by created_at", Boolean.class))
                .containsExactly(true, true);
        assertThat(ids(get("/api/conversations"))).isEmpty();
        assertThat(events.stream(ConversationChanged.class)).singleElement()
                .satisfies(event -> assertThat(event.conversationId()).as("the ID of the group")
                        .isEqualTo(idOf(tien, "t-1")));
    }

    // D-185: read is every message of every copy; unread again is the newest message of the primary copy only.
    @Test
    void readingAGroupReadsEveryCopy() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);

        change(idOf(tien, "t-1"), "{\"read\": true}").andExpect(jsonPath("$.unreadCount").value(0));
        assertThat(jdbc.queryForObject("select count(*) from message where not is_read", Long.class)).isZero();

        change(idOf(tien, "t-1"), "{\"read\": false}").andExpect(jsonPath("$.unreadCount").value(1));
        assertThat(jdbc.queryForList("select external_message_id from message where not is_read", String.class))
                .as("the newest message of the copy of tienct07").containsExactly("t-1-hello");
    }

    // D-66: a copy in an account turned off is left out, even the oldest one, which no longer names the group.
    @Test
    void aCopyInAnAccountOutOfTheInboxIsLeftOut() throws Exception {
        UUID off = connect("off@gmail.com", "Off");
        store(off, "o-1", inbound("o-1", "o-a", ALICE, "<a@mail.test>", XIN_CHAO, false));
        store(tien, "t-1", inbound("t-1", "t-a", ALICE, "<a@mail.test>", XIN_CHAO, false));
        store(sinon, "b-1", inbound("b-1", "b-a", ALICE, "<a@mail.test>", XIN_CHAO, false));
        ConnectedAccount account = accounts.findById(off).orElseThrow();
        account.disable();
        accounts.save(account);

        list(get("/api/conversations"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(idOf(tien, "t-1").toString()))
                .andExpect(jsonPath("$.items[0].accountIds", contains(tien.toString(), sinon.toString())));
        mvc.perform(get("/api/conversations/{id}", idOf(off, "o-1")).with(user("owner@sino.test")))
                .andExpect(status().isNotFound());
    }

    // D-188: the account that tied two copies is removed; the two stay one thread.
    @Test
    void aGroupStaysOneWhenTheAccountThatTiedItIsRemoved() throws Exception {
        UUID third = connect("third@gmail.com", "Third");
        store(tien, "t-1", inbound("t-1", "t-a", ALICE, "<a@mail.test>", XIN_CHAO, false));
        store(third, "c-1", inbound("c-1", "c-a", ALICE, "<a@mail.test>", XIN_CHAO, false),
                inbound("c-1", "c-b", ALICE, "<b@mail.test>", HELLO, false));
        store(sinon, "b-1", inbound("b-1", "b-b", ALICE, "<b@mail.test>", HELLO, false));
        ConnectedAccount account = accounts.findById(third).orElseThrow();
        account.remove(Instant.parse("2026-10-13T00:00:00Z"));
        accounts.save(account);

        list(get("/api/conversations"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].accountIds", contains(sinon.toString(), tien.toString())));
    }

    // D-186: the reply goes from the account of the primary copy, in its thread, and is stored there.
    @Test
    void aReplyGoesFromTheAccountOfThePrimaryCopy() throws Exception {
        UUID group = store(sinon, "b-1", outbound("b-1", "b-hello", SINON_ADDRESS, "<hello@mail.test>", HELLO));
        UUID primary = store(tien, "t-1", inbound("t-1", "t-hello", SINON, "<hello@mail.test>", HELLO,
                false));
        UUID clientMessageId = UUID.randomUUID();

        mvc.perform(get("/api/conversations/{id}", group).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.reply.state").value("READY"))
                .andExpect(jsonPath("$.reply.to[0].address").value(SINON_ADDRESS));
        reply(group, clientMessageId).andExpect(status().isCreated())
                .andExpect(jsonPath("$.clientMessageId").value(clientMessageId.toString()));

        assertThat(mail.sentMessages()).singleElement().satisfies(command -> {
            assertThat(command.externalConversationId()).isEqualTo("t-1");
            assertThat(command.replyToExternalMessageId()).isEqualTo("t-hello");
        });
        assertThat(jdbc.queryForObject("select conversation_id from message where client_message_id = ?", UUID.class,
                clientMessageId)).isEqualTo(primary);
    }

    // D-131: a failed send is sent again from the copy it was written to, though the other copy is the primary one by
    // then; never a second message, nor a second account.
    @Test
    void aSendAgainStaysInTheCopyItWasWrittenTo() throws Exception {
        UUID group = store(sinon, "b-1", outbound("b-1", "b-hello", SINON_ADDRESS, "<hello@mail.test>", HELLO));
        UUID first = store(tien, "t-1", inbound("t-1", "t-hello", SINON, "<hello@mail.test>", HELLO, false));
        UUID clientMessageId = UUID.randomUUID();
        mail.failNextSends(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "refused"));
        reply(group, clientMessageId).andExpect(status().isBadGateway());
        store(sinon, "b-1", inbound("b-1", "b-cc", ALICE, "<cc@mail.test>", HELLO.plusSeconds(600), false));

        reply(group, clientMessageId).andExpect(status().isCreated());

        assertThat(mail.sentMessages()).extracting(SendMessageCommand::externalConversationId)
                .containsExactly("t-1", "t-1");
        assertThat(mail.sentMessages()).as("to whom a reply in that copy goes, not Alice of the other copy")
                .extracting(command -> command.to().getFirst().address())
                .containsExactly(SINON_ADDRESS, SINON_ADDRESS);
        assertThat(jdbc.queryForList("select conversation_id from message where client_message_id = ?", UUID.class,
                clientMessageId)).containsExactly(first);
    }

    // D-131: the copy holding a send of unknown outcome left the inbox with its account; sending it again from the
    // other account could send it twice, so it is refused.
    @Test
    void aSendAgainOfAMessageInACopyOutOfTheInboxIsRefused() throws Exception {
        UUID group = store(sinon, "b-1", outbound("b-1", "b-hello", SINON_ADDRESS, "<hello@mail.test>", HELLO));
        store(tien, "t-1", inbound("t-1", "t-hello", SINON, "<hello@mail.test>", HELLO, false));
        store(sinon, "b-1", inbound("b-1", "b-a", ALICE, "<a@mail.test>", HELLO.minusSeconds(60), false));
        UUID clientMessageId = UUID.randomUUID();
        mail.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        reply(group, clientMessageId).andExpect(status().isGatewayTimeout());
        ConnectedAccount account = accounts.findById(tien).orElseThrow();
        account.disable();
        accounts.save(account);

        reply(group, clientMessageId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REPLY_NOT_ALLOWED"));

        assertThat(mail.sentMessages()).hasSize(1);
        assertThat(jdbc.queryForObject("select count(*) from message where client_message_id = ?", Long.class,
                clientMessageId)).isEqualTo(1);
    }

    // D-184: the thread "xin chào" holds the same three mails in each copy: three, not six, each taken from the copy it
    // went from, which keeps what Sino knows of a mail it sent.
    @Test
    void theMessagesOfAGroupAreEachThereOnce() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);
        UUID sentFromSino = UUID.randomUUID();
        jdbc.update("update message set client_message_id = ? where external_message_id = 't-1-xin-chao'",
                sentFromSino);

        messages(get("/api/conversations/{id}/messages", idOf(sinon, "b-1")))
                .andExpect(jsonPath("$.items[*].id", contains(messageId("b-1-hello").toString(),
                        messageId("t-1-xin-chao").toString(), messageId("b-1-helllo").toString())))
                .andExpect(jsonPath("$.items[*].direction", contains("OUTBOUND", "OUTBOUND", "OUTBOUND")))
                .andExpect(jsonPath("$.items[1].clientMessageId").value(sentFromSino.toString()))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
    }

    // D-184: a mail only one copy holds is there too, and so is every mail without a Message-ID, such as a reply Sino
    // has just sent: nothing says two of those are one. A mail that came in to both copies is taken from the primary
    // one, here the copy of Sinon, which holds the newest mail.
    @Test
    void aMessageOfOneCopyOnlyAndMessagesWithoutAMessageIdAreThere() throws Exception {
        store(tien, "t-1", inbound("t-1", "t-a", ALICE, "<a@mail.test>", XIN_CHAO, false),
                withoutMessageId("t-1", "same", HELLO));
        store(sinon, "b-1", inbound("b-1", "b-a", ALICE, "<a@mail.test>", XIN_CHAO, false),
                withoutMessageId("b-1", "same", HELLO), inbound("b-1", "b-cc", ALICE, "<cc@mail.test>",
                        HELLO.plusSeconds(600), false));

        List<String> ids = JsonPath.read(messages(get("/api/conversations/{id}/messages", idOf(tien, "t-1")))
                .andReturn().getResponse().getContentAsString(), "$.items[*].id");

        assertThat(ids).containsExactly(messageId("b-cc").toString(),
                maxOf(messageIdIn(tien, "same"), messageIdIn(sinon, "same")),
                minOf(messageIdIn(tien, "same"), messageIdIn(sinon, "same")), messageId("b-a").toString());
    }

    // D-184: the copy a message is taken from may date it later than the other copy; cut from the messages once each,
    // a page never brings the other copy back.
    @Test
    void pagesThroughTheMessagesOfAGroupEachOnce() throws Exception {
        store(sinon, "b-1", outbound("b-1", "b-hello", SINON_ADDRESS, "<hello@mail.test>", HELLO.plusSeconds(3)),
                outbound("b-1", "b-helllo", SINON_ADDRESS, "<helllo@mail.test>", HELLLO.plusSeconds(3)));
        store(tien, "t-1", inbound("t-1", "t-hello", SINON, "<hello@mail.test>", HELLO, false),
                inbound("t-1", "t-helllo", SINON, "<helllo@mail.test>", HELLLO, true));

        List<String> seen = new ArrayList<>();
        String cursor = null;
        do {
            MockHttpServletRequestBuilder request = get("/api/conversations/{id}/messages", idOf(tien, "t-1"))
                    .param("limit", "1");
            if (cursor != null) {
                request.param("cursor", cursor);
            }
            String body = messages(request).andReturn().getResponse().getContentAsString();
            seen.addAll(JsonPath.<List<String>>read(body, "$.items[*].id"));
            cursor = JsonPath.read(body, "$.nextCursor");
        } while (cursor != null && seen.size() < 10);

        assertThat(seen).containsExactly(messageId("b-hello").toString(), messageId("b-helllo").toString());
    }

    // The content of a message of any copy, through the ID of any copy; a message of another thread is not one.
    @Test
    void theContentOfAMessageOfAnyCopyIsThere() throws Exception {
        UUID group = store(tien, "t-1", inbound("t-1", "t-a", ALICE, "<a@mail.test>", XIN_CHAO, false));
        store(sinon, "b-1", inbound("b-1", "b-a", ALICE, "<a@mail.test>", XIN_CHAO, false),
                withHtml(inbound("b-1", "b-b", ALICE, "<b@mail.test>", HELLO, false), "<p>Chào em</p>"));
        store(tien, "t-9", inbound("t-9", "t-other", ALICE, "<other@mail.test>", HELLO, false));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", group, messageId("b-b"))
                .with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.html").value("<p>Chào em</p>"));
        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", group, messageId("t-other"))
                .with(user("owner@sino.test")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"));
    }

    // A file of a message of any copy is asked of the provider for the account of that copy, which, being a fake,
    // has no such file.
    @Test
    void aFileOfAMessageOfAnyCopyIsAskedForIt() throws Exception {
        UUID group = store(tien, "t-1", inbound("t-1", "t-a", ALICE, "<a@mail.test>", XIN_CHAO, false));
        store(sinon, "b-1", inbound("b-1", "b-a", ALICE, "<a@mail.test>", XIN_CHAO, false),
                inbound("b-1", "b-b", ALICE, "<b@mail.test>", HELLO, false, file()));
        UUID attachment = jdbc.queryForObject("""
                select a.id from attachment a join message m on m.id = a.message_id where m.external_message_id = 'b-b'
                """, UUID.class);
        int asked = mail.fileCalls();

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}", group,
                messageId("b-b"), attachment).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.code").value("ATTACHMENT_UNAVAILABLE"));
        assertThat(mail.fileCalls()).isEqualTo(asked + 1);
    }

    // A send that failed in the primary copy is discarded through the ID of the group, the oldest copy.
    @Test
    void aFailedSendInAnyCopyIsDiscarded() throws Exception {
        UUID group = store(sinon, "b-1", outbound("b-1", "b-hello", SINON_ADDRESS, "<hello@mail.test>", HELLO));
        store(tien, "t-1", inbound("t-1", "t-hello", SINON, "<hello@mail.test>", HELLO, false));
        UUID clientMessageId = UUID.randomUUID();
        mail.failNextSends(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "refused"));
        reply(group, clientMessageId).andExpect(status().isBadGateway());
        UUID failed = jdbc.queryForObject("select id from message where client_message_id = ?", UUID.class,
                clientMessageId);

        mvc.perform(delete("/api/conversations/{id}/messages/{messageId}", group, failed)
                .with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from message where client_message_id = ?", Long.class,
                clientMessageId)).isZero();
    }

    // D-189: what changed is told under the ID the inbox shows; an ID it does not know stays as it is.
    @Test
    void theInboxNamesEachCopyByItsGroup() throws Exception {
        xinChao(tien, "t-1", false);
        xinChao(sinon, "b-1", true);
        UUID unknown = UUID.randomUUID();

        assertThat(inboxIds.of(owner, List.of(idOf(sinon, "b-1"), idOf(tien, "t-1"), unknown)))
                .containsExactly(idOf(tien, "t-1"), unknown);
    }

    private void xinChao(UUID account, String thread, boolean ofSinon) {
        // Each copy dates what came in two seconds after what went.
        NormalizedParticipant other = ofSinon ? TIEN : SINON;
        String self = ofSinon ? SINON_ADDRESS : TIEN_ADDRESS;
        NormalizedMessage helllo = ofSinon
                ? outbound(thread, thread + "-helllo", self, "<helllo@mail.test>", HELLLO)
                : inbound(thread, thread + "-helllo", other, "<helllo@mail.test>", HELLLO.plusSeconds(2), true);
        NormalizedMessage xinChao = ofSinon
                ? inbound(thread, thread + "-xin-chao", other, "<xin-chao@mail.test>", XIN_CHAO.plusSeconds(2), false)
                : outbound(thread, thread + "-xin-chao", self, "<xin-chao@mail.test>", XIN_CHAO);
        NormalizedMessage hello = ofSinon
                ? outbound(thread, thread + "-hello", self, "<hello@mail.test>", HELLO)
                : inbound(thread, thread + "-hello", other, "<hello@mail.test>", HELLO.plusSeconds(2), false);
        store(account, thread, helllo, xinChao, hello);
    }

    private UUID store(UUID account, String thread, NormalizedMessage... messages) {
        boolean ofSinon = account.equals(sinon);
        NormalizedParticipant self = new NormalizedParticipant(ofSinon ? SINON_ADDRESS : TIEN_ADDRESS,
                ofSinon ? "Sinon sama" : "Tiến", null, true);
        NormalizedParticipant other = ofSinon ? TIEN : SINON;
        NormalizedConversation conversation = new NormalizedConversation(thread, ConversationType.THREAD, "xin chào",
                null, List.of(other, self, ALICE), null);
        transactions.executeWithoutResult(t -> store.store(account, new SyncBatch(List.of(conversation),
                Arrays.asList(messages), List.of(), new SyncCursor("next"), false)));
        return idOf(account, thread);
    }

    private ResultActions list(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.with(user("owner@sino.test"))).andExpect(status().isOk());
    }

    private List<String> ids(MockHttpServletRequestBuilder request) throws Exception {
        return JsonPath.read(list(request).andReturn().getResponse().getContentAsString(), "$.items[*].id");
    }

    private ResultActions messages(MockHttpServletRequestBuilder request) throws Exception {
        return list(request);
    }

    // The external IDs of these tests are unique across accounts, but for the ones messageIdIn names.
    private UUID messageId(String externalId) {
        return jdbc.queryForObject("select id from message where external_message_id = ?", UUID.class, externalId);
    }

    private UUID messageIdIn(UUID account, String externalId) {
        return jdbc.queryForObject("""
                select m.id from message m join conversation c on c.id = m.conversation_id
                where c.account_id = ? and m.external_message_id = ?
                """, UUID.class, account, externalId);
    }

    private static NormalizedMessage withoutMessageId(String thread, String id, Instant at) {
        return new NormalizedMessage(id, thread, ALICE.externalParticipantId(), MessageDirection.INBOUND,
                MessageType.TEXT, "Thư " + id, MessageStatus.UNKNOWN, false, null, at, List.of(), Map.of(), null,
                null);
    }

    private static NormalizedMessage withHtml(NormalizedMessage message, String html) {
        return new NormalizedMessage(message.externalMessageId(), message.externalConversationId(),
                message.senderExternalParticipantId(), message.direction(), message.type(), message.textContent(),
                message.status(), message.read(), message.replyToExternalMessageId(), message.sentAt(),
                message.attachments(), message.metadata(), message.recipients(), html);
    }

    private ResultActions reply(UUID id, UUID clientMessageId) throws Exception {
        return mvc.perform(post("/api/conversations/{id}/messages", id).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON)
                .content("{\"text\": \"Chào em\", \"clientMessageId\": \"" + clientMessageId + "\"}"));
    }

    private ResultActions change(UUID id, String body) throws Exception {
        return mvc.perform(patch("/api/conversations/{id}", id).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content(body));
    }

    private UUID idOf(UUID account, String thread) {
        return jdbc.queryForObject("select id from conversation where account_id = ? and external_conversation_id = ?",
                UUID.class, account, thread);
    }

    private UUID connect(String address, String name) {
        UUID id = accounts.save(ConnectedAccount.register(owner, ProviderType.of(SendingProviders.MAIL), address,
                name, null, address)).id();
        credentials.save(id, new OAuth2Credentials("ya29.sample", null, READ_AND_SEND), "1//sample");
        return id;
    }

    private static NormalizedMessage inbound(String thread, String id, NormalizedParticipant from,
            String messageId, Instant at, boolean read, NormalizedAttachment... files) {
        return new NormalizedMessage(id, thread, from.externalParticipantId(), MessageDirection.INBOUND,
                files.length == 0 ? MessageType.TEXT : MessageType.MIXED, textOf(id), MessageStatus.UNKNOWN, read,
                null, at, List.of(files), Map.of("rfcMessageId", messageId), null, null);
    }

    private static NormalizedMessage outbound(String thread, String id, String from, String messageId, Instant at) {
        return new NormalizedMessage(id, thread, from, MessageDirection.OUTBOUND, MessageType.TEXT, textOf(id),
                MessageStatus.SENT, true, null, at, List.of(), Map.of("rfcMessageId", messageId), null, null);
    }

    // "t-1-hello" reads "hello", "b-1-xin-chao" reads "xin chào".
    private static String textOf(String id) {
        if (id.endsWith("-xin-chao")) {
            return "xin chào";
        }
        if (id.endsWith("-helllo")) {
            return "Helllo";
        }
        return id.endsWith("-hello") ? "hello" : "Thư " + id;
    }

    private static NormalizedAttachment file() {
        return new NormalizedAttachment("f-1", "a.pdf", "application/pdf", 1L, null, null, null);
    }

    private static String maxOf(UUID first, UUID second) {
        return (first.compareTo(second) > 0 ? first : second).toString();
    }

    private static String minOf(UUID first, UUID second) {
        return (first.compareTo(second) > 0 ? second : first).toString();
    }

}
