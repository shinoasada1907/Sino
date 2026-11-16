package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.StoreResult;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.Mailbox;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * The mail folders of the inbox (MF-02, D-498 to D-500): which views a conversation shows in, given the mailbox of
 * its messages, on the whole application and a real PostgreSQL.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class MailFoldersApiTests {

    private static final Instant AT = Instant.parse("2026-10-05T08:00:00Z");
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
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        gmail = connect("owner@gmail.test");
    }

    @Test
    void eachConversationShowsInTheViewsItsMailboxesSay() throws Exception {
        mail("inbox", received("inbox", "m-1", Mailbox.INBOX, true));
        mail("trashed", received("trashed", "m-1", Mailbox.TRASH, true));
        mail("spam", received("spam", "m-1", Mailbox.SPAM, true));
        mail("spamAndTrash", received("spamAndTrash", "m-1", Mailbox.SPAM, true),
                received("spamAndTrash", "m-2", Mailbox.TRASH, true));
        mail("archived", received("archived", "m-1", Mailbox.ARCHIVE, true));
        mail("archivedThenNew", received("archivedThenNew", "m-1", Mailbox.ARCHIVE, true),
                received("archivedThenNew", "m-2", Mailbox.INBOX, true));
        mail("sentOnly", sent("sentOnly", "m-1", null));
        mail("answered", received("answered", "m-1", Mailbox.INBOX, true), sent("answered", "m-2", null));
        mail("answeredThenTrashed", received("answeredThenTrashed", "m-1", Mailbox.TRASH, true),
                sent("answeredThenTrashed", "m-2", null));
        mail("archivedAndAnswered", received("archivedAndAnswered", "m-1", Mailbox.ARCHIVE, true),
                sent("archivedAndAnswered", "m-2", null));
        mail("legacy", received("legacy", "m-1", null, true));
        mail("flagged", received("flagged", "m-1", Mailbox.INBOX, true));
        mail("trashedAndFlagged", received("trashedAndFlagged", "m-1", Mailbox.TRASH, true));
        jdbc.update("update conversation set archived = true where external_conversation_id in "
                + "('flagged', 'trashedAndFlagged')");

        assertThat(subjects("all")).containsExactlyInAnyOrder("inbox", "archivedThenNew", "sentOnly", "answered",
                "legacy");
        assertThat(subjects("archived")).containsExactlyInAnyOrder("archived", "archivedAndAnswered", "flagged");
        assertThat(subjects("sent")).containsExactlyInAnyOrder("sentOnly", "answered", "answeredThenTrashed",
                "archivedAndAnswered");
        assertThat(subjects("trash")).containsExactlyInAnyOrder("trashed", "spam", "spamAndTrash",
                "answeredThenTrashed", "trashedAndFlagged");
    }

    @Test
    void aMessageThatChangesMailboxMovesItsConversationOnTheNextSync() throws Exception {
        mail("moving", received("moving", "m-1", Mailbox.INBOX, true));
        assertThat(subjects("all")).containsExactly("moving");

        mail("moving", received("moving", "m-1", Mailbox.TRASH, true));

        assertThat(subjects("all")).isEmpty();
        assertThat(subjects("trash")).containsExactly("moving");

        mail("moving", received("moving", "m-1", Mailbox.INBOX, true));

        assertThat(subjects("all")).containsExactly("moving");
        assertThat(subjects("trash")).isEmpty();
    }

    @Test
    void theCountsLeaveOutWhatTheInboxDoesNotShow() throws Exception {
        mail("inbox", received("inbox", "m-1", Mailbox.INBOX, false));
        mail("trashed", received("trashed", "m-1", Mailbox.TRASH, false));
        mail("spam", received("spam", "m-1", Mailbox.SPAM, false));
        mail("archived", received("archived", "m-1", Mailbox.ARCHIVE, false));

        String counts = mvc.perform(get("/api/conversations/counts").with(user("owner@sino.test")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat((Integer) JsonPath.read(counts, "$.unread")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(counts, "$.needsReply")).isEqualTo(1);
        assertThat(subjects("unread")).containsExactly("inbox");
        assertThat(subjects("reply")).containsExactly("inbox");
    }

    @Test
    void aThreadInTwoAccountsCombinesTheMailboxesOfItsCopies() throws Exception {
        UUID other = connect("other@gmail.test");
        // The same mail in both mailboxes: only the second account trashed it.
        copy(gmail, "both", "<both@mail.test>", Mailbox.INBOX);
        copy(other, "both", "<both@mail.test>", Mailbox.TRASH);
        // Archived in one, trashed in the other: neither copy is in an inbox.
        copy(gmail, "away", "<away@mail.test>", Mailbox.ARCHIVE);
        copy(other, "away", "<away@mail.test>", Mailbox.TRASH);

        assertThat(subjects("all")).containsExactly("both");
        assertThat(subjects("archived")).containsExactly("away");
        assertThat(subjects("trash")).containsExactlyInAnyOrder("both", "away");
    }

    @Test
    void aChatAlwaysStaysInTheInbox() throws Exception {
        UUID chat = accounts.save(ConnectedAccount.register(owner, ProviderType.of("zalo"), "zalo-1", "Zalo", null,
                null)).id();
        NormalizedConversation conversation = new NormalizedConversation("chat", ConversationType.DIRECT, "chat",
                null, List.of(ALICE, OWNER), null);
        NormalizedMessage message = new NormalizedMessage("m-1", "chat", "alice@example.test",
                MessageDirection.INBOUND, MessageType.TEXT, "Chào", MessageStatus.UNKNOWN, true, null, AT, List.of(),
                Map.of(), null, null);
        transactions.executeWithoutResult(t -> store.store(chat, new SyncBatch(List.of(conversation),
                List.of(message), List.of(), new SyncCursor("next"), false)));

        assertThat(titles("all")).containsExactly("chat");
        assertThat(titles("archived")).isEmpty();
        assertThat(titles("trash")).isEmpty();
    }

    @ParameterizedTest
    @CsvSource(nullValues = "-", value = { "INBOX, 1, false", "-, 1, false", "SPAM, 0, true", "TRASH, 0, true",
        "ARCHIVE, 0, true" })
    void onlyMailThatLandsInTheInboxIsNewAndBringsAnArchivedConversationBack(String mailbox, int newInbound,
            boolean stillArchived) {
        mail("old", received("old", "m-1", Mailbox.INBOX, true));
        jdbc.update("update conversation set archived = true");
        NormalizedMessage later = new NormalizedMessage("m-2", "old", "alice@example.test",
                MessageDirection.INBOUND, MessageType.TEXT, "Thư mới", MessageStatus.UNKNOWN, false, null,
                AT.plusSeconds(3600), List.of(), Map.of(), null, null,
                mailbox == null ? null : Mailbox.valueOf(mailbox));

        StoreResult result = mailTo(gmail, "old", later);

        assertThat(result.newMessages()).isEqualTo(1);
        assertThat(result.newInbound()).isEqualTo(newInbound);
        assertThat(jdbc.queryForObject("select archived from conversation", Boolean.class)).isEqualTo(stillArchived);
    }

    private void copy(UUID account, String id, String rfcId, Mailbox mailbox) {
        NormalizedMessage message = new NormalizedMessage(id + "-m", id, "alice@example.test",
                MessageDirection.INBOUND, MessageType.TEXT, "Thư " + id, MessageStatus.UNKNOWN, true, null, AT,
                List.of(), Map.of("rfcMessageId", rfcId), null, null, mailbox);
        mailTo(account, id, message);
    }

    private void mail(String id, NormalizedMessage... messages) {
        mailTo(gmail, id, messages);
    }

    private StoreResult mailTo(UUID account, String id, NormalizedMessage... messages) {
        NormalizedConversation conversation = new NormalizedConversation(id, ConversationType.THREAD, id, null,
                List.of(ALICE, OWNER), null);
        return transactions.execute(t -> store.store(account, new SyncBatch(List.of(conversation),
                Arrays.asList(messages), List.of(), new SyncCursor("next"), false)));
    }

    private static NormalizedMessage received(String conversation, String id, Mailbox mailbox, boolean read) {
        return new NormalizedMessage(id, conversation, "alice@example.test", MessageDirection.INBOUND,
                MessageType.TEXT, "Thư " + id, MessageStatus.UNKNOWN, read, null, AT, List.of(), Map.of(), null,
                null, mailbox);
    }

    private static NormalizedMessage sent(String conversation, String id, Mailbox mailbox) {
        return new NormalizedMessage(id, conversation, "owner@gmail.test", MessageDirection.OUTBOUND,
                MessageType.TEXT, "Thư " + id, MessageStatus.SENT, true, null, AT.plusSeconds(60), List.of(), Map.of(),
                null, null, mailbox);
    }

    private List<String> subjects(String view) throws Exception {
        return field(view, "subject");
    }

    private List<String> titles(String view) throws Exception {
        return field(view, "title");
    }

    private List<String> field(String view, String name) throws Exception {
        return JsonPath.read(mvc.perform(get("/api/conversations").param("view", view).param("limit", "50")
                .with(user("owner@sino.test"))).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(), "$.items[*]." + name);
    }

    private UUID connect(String externalAccountId) {
        return accounts.save(ConnectedAccount.register(owner, ProviderType.of("gmail"), externalAccountId, "Account",
                null, null)).id();
    }

}
