package dev.sino.sync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderKind;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MailboxListing;
import dev.sino.provider.spi.Mailbox;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;
import dev.sino.sync.application.FolderCatchUp;
import dev.sino.sync.infrastructure.SyncCheckpoints;

/**
 * The one-off catch-up of the mail folders (MF-03, D-501), on the whole application and a real PostgreSQL, with a
 * connector that answers from lists the test sets: no real Gmail is called.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, FolderCatchUpTests.Connectors.class })
@ActiveProfiles("test")
class FolderCatchUpTests {

    private static final Instant AT = Instant.parse("2026-10-05T08:00:00Z");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice", null,
            false);
    private static final NormalizedParticipant OWNER = new NormalizedParticipant("owner@gmail.test", null, null,
            true);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private ConversationStore store;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private SyncCheckpoints checkpoints;

    @Autowired
    private FolderCatchUp catchUp;

    @Autowired
    private FoldersProvider provider;

    @Autowired
    private Announcements announcements;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;

    @BeforeEach
    void startFromNothing() {
        jdbc.update("delete from sync_checkpoint");
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        provider.reset();
        announcements.clear();
    }

    @Test
    void mailStoredBeforeMailboxesGetsItsMailboxAndShowsInTheRightViews() throws Exception {
        UUID account = importedAccount();
        legacy(account, "stayed", MessageDirection.INBOUND, "m-stayed");
        legacy(account, "archived", MessageDirection.INBOUND, "m-archived");
        legacy(account, "sentOnly", MessageDirection.OUTBOUND, "m-sent");
        legacy(account, "junked", MessageDirection.INBOUND, "m-junked");
        legacy(account, "binned", MessageDirection.INBOUND, "m-binned");
        provider.lists(account, new MailboxListing(List.of("m-junked"), List.of("m-binned"), List.of("m-archived")));

        assertThat(catchUp.run(account)).isTrue();

        assertThat(mailboxes()).containsEntry("m-stayed", "INBOX").containsEntry("m-archived", "ARCHIVE")
                .containsEntry("m-junked", "SPAM").containsEntry("m-binned", "TRASH")
                .containsEntry("m-sent", null);
        assertThat(subjects("all")).containsExactlyInAnyOrder("stayed", "sentOnly");
        assertThat(subjects("archived")).containsExactly("archived");
        assertThat(subjects("trash")).containsExactlyInAnyOrder("junked", "binned");
    }

    @Test
    void spamAndTrashTheImportNeverReadAreStoredWithoutNewMailOrUnarchiving() throws Exception {
        UUID account = importedAccount();
        legacy(account, "thread", MessageDirection.INBOUND, "m-1");
        jdbc.update("update conversation set archived = true");
        provider.lists(account, new MailboxListing(List.of("m-spam"), List.of("m-bin", "m-1b"), List.of()));
        provider.readable("m-spam", message("spam", "m-spam", Mailbox.SPAM));
        provider.readable("m-bin", message("bin", "m-bin", Mailbox.TRASH));
        provider.readable("m-1b", message("thread", "m-1b", Mailbox.TRASH));

        assertThat(catchUp.run(account)).isTrue();

        assertThat(mailboxes()).containsEntry("m-spam", "SPAM").containsEntry("m-bin", "TRASH")
                .containsEntry("m-1b", "TRASH").containsEntry("m-1", "INBOX");
        assertThat(subjects("trash")).as("a thread with a trashed message shows there too")
                .containsExactlyInAnyOrder("spam", "bin", "thread");
        assertThat(jdbc.queryForObject("select archived from conversation where external_conversation_id = 'thread'",
                Boolean.class)).as("an archived conversation stays archived").isTrue();
        assertThat(announcements.stored()).as("something changed, so tabs read again").isNotEmpty()
                .allSatisfy(event -> {
                    assertThat(event.newInbound()).as("no new mail").isZero();
                    assertThat(event.live()).isFalse();
                });
    }

    @Test
    void messagesAreReadOnlyWhenTheyAreNotStoredYet() {
        UUID account = importedAccount();
        legacy(account, "held", MessageDirection.INBOUND, "m-held");
        provider.lists(account, new MailboxListing(List.of(), List.of("m-held", "m-new"), List.of()));
        provider.readable("m-new", message("new", "m-new", Mailbox.TRASH));

        catchUp.run(account);

        assertThat(provider.fetched()).containsExactly("m-new");
    }

    @Test
    void itRunsOncePerAccountAndNotAgainAfterARestart() throws Exception {
        UUID account = importedAccount();
        legacy(account, "archived", MessageDirection.INBOUND, "m-1");
        provider.lists(account, new MailboxListing(List.of(), List.of(), List.of("m-1")));
        assertThat(checkpoints.awaitingFolders()).containsExactly(account);

        assertThat(catchUp.run(account)).isTrue();

        assertThat(jdbc.queryForObject("select folders_caught_up_at from sync_checkpoint", Object.class))
                .isNotNull();
        assertThat(checkpoints.awaitingFolders()).as("a restart finds nothing to do").isEmpty();
        assertThat(catchUp.run(account)).isFalse();
        catchUp.submitPending();
        assertThat(provider.listCalls(account)).isEqualTo(1);
        assertThat(subjects("archived")).containsExactly("archived");
    }

    @Test
    void anAccountThatFailsIsLeftForTheNextStartAndDoesNotStopTheOthers() throws Exception {
        UUID broken = importedAccount();
        UUID fine = importedAccount();
        legacy(broken, "brokenMail", MessageDirection.INBOUND, "b-1");
        legacy(fine, "fineMail", MessageDirection.INBOUND, "f-1");
        provider.lists(broken, new MailboxListing(List.of(), List.of(), List.of("b-1")));
        provider.lists(fine, new MailboxListing(List.of(), List.of(), List.of("f-1")));
        provider.failing(broken);

        assertThat(catchUp.run(broken)).isFalse();
        assertThat(catchUp.run(fine)).isTrue();

        assertThat(checkpoints.awaitingFolders()).containsExactly(broken);
        assertThat(mailboxes()).containsEntry("b-1", null).containsEntry("f-1", "ARCHIVE");

        provider.recovered(broken);
        assertThat(catchUp.run(broken)).isTrue();

        assertThat(checkpoints.awaitingFolders()).isEmpty();
        assertThat(mailboxes()).containsEntry("b-1", "ARCHIVE");
    }

    @Test
    void aFailureWhileReadingMissingMailLeavesTheAccountUnmarked() {
        UUID account = importedAccount();
        legacy(account, "archived", MessageDirection.INBOUND, "m-1");
        provider.lists(account, new MailboxListing(List.of("m-gone-wrong"), List.of(), List.of("m-1")));
        provider.failingToRead(account);

        assertThat(catchUp.run(account)).isFalse();

        assertThat(checkpoints.awaitingFolders()).containsExactly(account);
        assertThat(mailboxes()).as("nothing is applied half way").containsEntry("m-1", null);
    }

    @Test
    void aProviderWithoutFoldersIsMarkedAndLeftAlone() {
        UUID account = importedAccount();
        legacy(account, "chatty", MessageDirection.INBOUND, "m-1");
        provider.hasNoFolders();

        assertThat(catchUp.run(account)).isTrue();

        assertThat(checkpoints.awaitingFolders()).isEmpty();
        assertThat(mailboxes()).containsEntry("m-1", null);
    }

    @Test
    void anAccountWhoseImportIsNotDoneWaits() {
        UUID account = registered();
        checkpoints.start(account, "DAYS_90", null);

        assertThat(checkpoints.awaitingFolders()).isEmpty();
        assertThat(catchUp.run(account)).isFalse();
        assertThat(provider.listCalls(account)).isZero();
    }

    private UUID registered() {
        return registration.register(new RegisterAccountCommand(owner, FoldersProvider.TYPE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null), new TokenCredentials("t"), null));
    }

    private UUID importedAccount() {
        UUID account = registered();
        checkpoints.start(account, "DAYS_90", null);
        checkpoints.advance(account, "cursor", 0, 0, true);
        return account;
    }

    // Mail as the import of an early version stored it: no mailbox.
    private void legacy(UUID account, String conversation, MessageDirection direction, String id) {
        NormalizedMessage message = direction == MessageDirection.INBOUND ? message(conversation, id, null)
                : new NormalizedMessage(id, conversation, "owner@gmail.test", direction, MessageType.TEXT,
                        "Thư " + id, MessageStatus.SENT, true, null, AT, List.of(), Map.of(), null, null, null);
        transactions.executeWithoutResult(t -> store.store(account, batchOf(message)));
        // Stored through the connector the way an old version did: without a mailbox, flags from the direction.
        jdbc.update("update message set mailbox = null where external_message_id = ?", id);
        jdbc.update("update conversation set has_inbox = ?, has_sent = ?, has_archive = false, has_junk = false"
                + " where external_conversation_id = ?", direction == MessageDirection.INBOUND,
                direction == MessageDirection.OUTBOUND, conversation);
    }

    private static NormalizedMessage message(String conversation, String id, Mailbox mailbox) {
        return new NormalizedMessage(id, conversation, "alice@example.test", MessageDirection.INBOUND,
                MessageType.TEXT, "Thư " + id, MessageStatus.UNKNOWN, true, null, AT, List.of(), Map.of(), null, null,
                mailbox);
    }

    private static SyncBatch batchOf(NormalizedMessage... messages) {
        List<NormalizedConversation> conversations = Arrays.stream(messages)
                .map(m -> new NormalizedConversation(m.externalConversationId(), ConversationType.THREAD,
                        m.externalConversationId(), null, List.of(ALICE, OWNER), null)).distinct().toList();
        return new SyncBatch(conversations, Arrays.asList(messages), List.of(), new SyncCursor("next"), false);
    }

    private Map<String, String> mailboxes() {
        Map<String, String> found = new java.util.HashMap<>();
        jdbc.query("select external_message_id, mailbox from message",
                row -> {
                    found.put(row.getString(1), row.getString(2));
                });
        return found;
    }

    private List<String> subjects(String view) throws Exception {
        return JsonPath.read(mvc.perform(get("/api/conversations").param("view", view).param("limit", "50")
                .with(user("owner@sino.test"))).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(), "$.items[*].subject");
    }

    /** What the catch-up announces. */
    static class Announcements {

        private final List<MailStored> stored = new CopyOnWriteArrayList<>();

        @EventListener
        void on(MailStored event) {
            stored.add(event);
        }

        List<MailStored> stored() {
            return List.copyOf(stored);
        }

        void clear() {
            stored.clear();
        }

    }

    /** A connector with folders, whose lists and messages the test sets. */
    static final class FoldersProvider implements MessageProvider {

        static final ProviderType TYPE = ProviderType.of("fake-folders");

        private final Map<UUID, MailboxListing> listings = new ConcurrentHashMap<>();
        private final Map<String, NormalizedMessage> readable = new ConcurrentHashMap<>();
        private final Set<UUID> failing = ConcurrentHashMap.newKeySet();
        private final Set<UUID> failingToRead = ConcurrentHashMap.newKeySet();
        private final Map<UUID, AtomicInteger> listCalls = new ConcurrentHashMap<>();
        private final List<String> fetched = new CopyOnWriteArrayList<>();
        private volatile boolean folders = true;

        void reset() {
            listings.clear();
            readable.clear();
            failing.clear();
            failingToRead.clear();
            listCalls.clear();
            fetched.clear();
            folders = true;
        }

        void lists(UUID account, MailboxListing listing) {
            listings.put(account, listing);
        }

        void readable(String id, NormalizedMessage message) {
            readable.put(id, message);
        }

        void failing(UUID account) {
            failing.add(account);
        }

        void recovered(UUID account) {
            failing.remove(account);
        }

        void failingToRead(UUID account) {
            failingToRead.add(account);
        }

        void hasNoFolders() {
            folders = false;
        }

        int listCalls(UUID account) {
            return listCalls.getOrDefault(account, new AtomicInteger()).get();
        }

        List<String> fetched() {
            return List.copyOf(fetched);
        }

        @Override
        public ProviderType type() {
            return TYPE;
        }

        @Override
        public ProviderKind kind() {
            return ProviderKind.EMAIL;
        }

        @Override
        public ProviderCapabilities capabilities() {
            return ProviderCapabilities.of(ProviderCapability.READ_MESSAGES);
        }

        @Override
        public AccountProfile getAccountProfile(ProviderContext context) {
            return new AccountProfile("fake", "Fake", null, null);
        }

        @Override
        public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Optional<MailboxListing> listMailboxes(ProviderContext context, Instant since) {
            listCalls.computeIfAbsent(context.accountId(), id -> new AtomicInteger()).incrementAndGet();
            if (failing.contains(context.accountId())) {
                throw new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "Gmail is down");
            }
            return folders ? Optional.of(listings.getOrDefault(context.accountId(),
                    new MailboxListing(List.of(), List.of(), List.of()))) : Optional.empty();
        }

        @Override
        public SyncBatch fetchMessages(ProviderContext context, List<String> ids, Instant since) {
            if (failingToRead.contains(context.accountId())) {
                throw new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "Gmail is down");
            }
            fetched.addAll(ids);
            NormalizedMessage[] messages = ids.stream().map(readable::get).filter(java.util.Objects::nonNull)
                    .toArray(NormalizedMessage[]::new);
            return batchOf(messages);
        }

    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Connectors {

        @Bean
        FoldersProvider foldersProvider() {
            return new FoldersProvider();
        }

        @Bean
        Announcements announcements() {
            return new Announcements();
        }

    }

}
