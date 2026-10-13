package dev.sino.conversation.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountSummary;
import dev.sino.conversation.ConversationStore;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * One thread found in several accounts of the owner is one group (F05b, D-180): conversations of the same owner and
 * provider, in different accounts, that hold a message with the same {@code Message-ID}. In a real PostgreSQL; each
 * test runs in a transaction that is rolled back.
 */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, JdbcConversationStore.class, ConversationSummaries.class,
        ThreadGroups.class })
@ActiveProfiles("test")
class ThreadGroupsTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final Instant MONDAY = Instant.parse("2026-10-05T08:00:00Z");

    @Autowired
    private ConversationStore store;

    @Autowired
    private ThreadGroups groups;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private AccountDirectory directory;

    private final UUID owner = UUID.randomUUID();
    private final UUID tien = UUID.randomUUID();
    private final UUID bonzed = UUID.randomUUID();
    private final UUID third = UUID.randomUUID();
    private final UUID chat = UUID.randomUUID();
    private final UUID stranger = UUID.randomUUID();
    private final UUID disabled = UUID.randomUUID();
    private final UUID removed = UUID.randomUUID();

    @BeforeEach
    void theOwnerHasThreeGmailAccountsAndAChatOne() {
        List<AccountSummary> mine = List.of(account(tien, owner, GMAIL), account(bonzed, owner, GMAIL),
                account(third, owner, GMAIL), account(chat, owner, ProviderType.of("chat")),
                new AccountSummary(disabled, owner, GMAIL, AccountStatus.DISABLED, "disabled", false));
        when(directory.accountsOf(owner)).thenReturn(mine);
        mine.forEach(account -> when(directory.byId(account.id())).thenReturn(Optional.of(account)));
        AccountSummary someoneElses = account(stranger, UUID.randomUUID(), GMAIL);
        when(directory.byId(stranger)).thenReturn(Optional.of(someoneElses));
        when(directory.accountsOf(someoneElses.ownerId())).thenReturn(List.of(someoneElses));
    }

    @Test
    void aConversationAloneIsItsOwnGroup() {
        store(tien, "t-1", mail("t-1", "x-1", "<hello@mail.test>"));

        assertThat(groupOf(tien, "t-1")).isEqualTo(idOf(tien, "t-1"));
    }

    // The mail the owner sent from one account to the other is in both mailboxes (D-180).
    @Test
    void aThreadInTwoAccountsOfTheOwnerIsOneGroup() {
        store(tien, "t-1", mail("t-1", "x-1", "<hello@mail.test>"));
        store(bonzed, "b-1", mail("b-1", "y-1", "<hello@mail.test>"));

        assertThat(groupOf(bonzed, "b-1")).as("the group of the oldest conversation").isEqualTo(groupOf(tien, "t-1"))
                .isEqualTo(idOf(tien, "t-1"));
    }

    @Test
    void aMailBothGetLaterJoinsTwoGroups() {
        store(tien, "t-1", mail("t-1", "x-1", "<a@mail.test>"));
        store(bonzed, "b-1", mail("b-1", "y-1", "<b@mail.test>"));
        assertThat(groupOf(tien, "t-1")).isNotEqualTo(groupOf(bonzed, "b-1"));

        store(tien, "t-1", mail("t-1", "x-2", "<both@mail.test>"));
        store(bonzed, "b-1", mail("b-1", "y-2", "<both@mail.test>"));

        assertThat(groupOf(bonzed, "b-1")).isEqualTo(groupOf(tien, "t-1")).isEqualTo(idOf(tien, "t-1"));
    }

    @Test
    void aGroupHoldsWhatItsConversationsShareWithOthers() {
        store(tien, "t-1", mail("t-1", "x-1", "<one@mail.test>"));
        store(third, "c-1", mail("c-1", "z-1", "<two@mail.test>"));

        store(bonzed, "b-1", mail("b-1", "y-1", "<one@mail.test>"), mail("b-1", "y-2", "<two@mail.test>"));

        assertThat(List.of(groupOf(tien, "t-1"), groupOf(bonzed, "b-1"), groupOf(third, "c-1")))
                .containsOnly(idOf(tien, "t-1"));
    }

    // Every conversation of both groups follows, even one that shares nothing with the mail that joined them.
    @Test
    void twoGroupsBecomeOne() {
        store(tien, "t-1", mail("t-1", "x-1", "<one@mail.test>"));
        store(bonzed, "b-1", mail("b-1", "y-1", "<one@mail.test>"));
        store(tien, "t-2", mail("t-2", "x-2", "<three@mail.test>"));
        store(third, "c-1", mail("c-1", "z-1", "<three@mail.test>"));
        assertThat(groupOf(third, "c-1")).isEqualTo(idOf(tien, "t-2"));

        store(bonzed, "b-1", mail("b-1", "y-2", "<four@mail.test>"));
        store(third, "c-1", mail("c-1", "z-2", "<four@mail.test>"));

        assertThat(List.of(groupOf(tien, "t-1"), groupOf(bonzed, "b-1"), groupOf(tien, "t-2"), groupOf(third, "c-1")))
                .containsOnly(idOf(tien, "t-1"));
    }

    // created_at is when the transaction that made it began, the ID when the row was written: not always the same
    // order, and the oldest is the first made.
    @Test
    void theFirstConversationMadeNamesTheGroup() {
        store(bonzed, "b-1", mail("b-1", "y-1", "<one@mail.test>"));
        store(tien, "t-1", mail("t-1", "x-1", "<two@mail.test>"));
        jdbc.sql("UPDATE conversation SET created_at = created_at - interval '1 day' WHERE id = :id")
                .param("id", idOf(tien, "t-1")).update();

        store(bonzed, "b-1", mail("b-1", "y-2", "<both@mail.test>"));
        store(tien, "t-1", mail("t-1", "x-2", "<both@mail.test>"));

        assertThat(groupOf(bonzed, "b-1")).isEqualTo(groupOf(tien, "t-1")).isEqualTo(idOf(tien, "t-1"));
    }

    // A reply sent from Sino has no Message-ID until a sync brings it back from Gmail: then it joins (BE-60).
    @Test
    void aMessageThatGetsItsMessageIdLaterJoins() {
        store(tien, "t-1", mail("t-1", "x-1", null));
        store(bonzed, "b-1", mail("b-1", "y-1", "<sent-from-sino@mail.test>"));
        assertThat(groupOf(bonzed, "b-1")).isNotEqualTo(groupOf(tien, "t-1"));

        store(tien, "t-1", mail("t-1", "x-1", "<sent-from-sino@mail.test>"));

        assertThat(groupOf(bonzed, "b-1")).isEqualTo(groupOf(tien, "t-1"));
    }

    // A disabled account is still the owner's (D-12): its mail groups, the inbox leaves it out (BE-81).
    @Test
    void aDisabledAccountGroupsLikeAnyOther() {
        store(disabled, "d-1", mail("d-1", "w-1", "<hello@mail.test>"));
        store(tien, "t-1", mail("t-1", "x-1", "<hello@mail.test>"));

        assertThat(groupOf(disabled, "d-1")).isEqualTo(groupOf(tien, "t-1"));
    }

    // A removed account is no longer the owner's: the directory does not know it, and nothing joins it.
    @Test
    void aRemovedAccountGroupsWithNothing() {
        store(removed, "r-1", mail("r-1", "v-1", "<hello@mail.test>"));
        store(tien, "t-1", mail("t-1", "x-1", "<hello@mail.test>"));

        assertThat(groupOf(tien, "t-1")).isNotEqualTo(groupOf(removed, "r-1"));
        assertThat(groupOf(removed, "r-1")).isEqualTo(idOf(removed, "r-1"));
    }

    // Gmail split one thread in one mailbox and not in the other: one thread all the same (the user, 2026-10-12).
    @Test
    void twoThreadsOfOneMailboxJoinThroughAnotherThatHoldsBoth() {
        store(tien, "t-1", mail("t-1", "x-1", "<one@mail.test>"));
        store(tien, "t-2", mail("t-2", "x-2", "<two@mail.test>"));

        store(bonzed, "b-1", mail("b-1", "y-1", "<one@mail.test>"), mail("b-1", "y-2", "<two@mail.test>"));

        assertThat(List.of(groupOf(tien, "t-1"), groupOf(tien, "t-2"), groupOf(bonzed, "b-1")))
                .containsOnly(idOf(tien, "t-1"));
    }

    // Two threads of one mailbox are two threads, whatever they share.
    @Test
    void twoThreadsOfOneAccountStayApart() {
        store(tien, "t-1", mail("t-1", "x-1", "<same@mail.test>"));
        store(tien, "t-2", mail("t-2", "x-2", "<same@mail.test>"));

        assertThat(groupOf(tien, "t-2")).isNotEqualTo(groupOf(tien, "t-1"));
    }

    @Test
    void anotherProviderOrAnotherOwnerStaysApart() {
        store(tien, "t-1", mail("t-1", "x-1", "<hello@mail.test>"));
        store(chat, "g-1", mail("g-1", "c-1", "<hello@mail.test>"));
        store(stranger, "s-1", mail("s-1", "s-1", "<hello@mail.test>"));

        assertThat(Set.of(groupOf(tien, "t-1"), groupOf(chat, "g-1"), groupOf(stranger, "s-1"))).hasSize(3);
    }

    // Nothing says two messages without a Message-ID are one, not even the same external ID in two mailboxes.
    @Test
    void mailWithoutAMessageIdStaysApart() {
        store(tien, "t-1", mail("t-1", "x-1", null));
        store(bonzed, "b-1", mail("b-1", "x-1", null));

        assertThat(groupOf(bonzed, "b-1")).isNotEqualTo(groupOf(tien, "t-1"));
    }

    // Mail stored before groups existed (D-180): grouped when Sino starts.
    @Test
    void theMailAlreadyThereIsGrouped() {
        store(tien, "t-1", mail("t-1", "x-1", "<hello@mail.test>"));
        store(bonzed, "b-1", mail("b-1", "y-1", "<hello@mail.test>"));
        store(third, "c-1", mail("c-1", "z-1", "<other@mail.test>"));
        jdbc.sql("UPDATE conversation SET grouped_with = NULL WHERE account_id IN (:accounts)")
                .param("accounts", List.of(tien, bonzed, third)).update();
        assertThat(groupOf(bonzed, "b-1")).isNotEqualTo(groupOf(tien, "t-1"));

        groups.groupAll();

        assertThat(groupOf(bonzed, "b-1")).isEqualTo(groupOf(tien, "t-1")).isEqualTo(idOf(tien, "t-1"));
        assertThat(groupOf(third, "c-1")).isEqualTo(idOf(third, "c-1"));
    }

    // Two syncs storing the same mail at once could each look for the other's copy before it is committed.
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void twoAccountsStoringTheSameMailAtOnceMakeOneGroup() throws Exception {
        TransactionTemplate inTransaction = new TransactionTemplate(transactionManager);
        CountDownLatch firstStored = new CountDownLatch(1);
        CountDownLatch commitFirst = new CountDownLatch(1);
        try {
            CompletableFuture<Void> first = CompletableFuture.runAsync(() -> inTransaction.executeWithoutResult(t -> {
                store(tien, "t-1", mail("t-1", "x-1", "<hello@mail.test>"));
                firstStored.countDown();
                await(commitFirst);
            }));
            assertThat(firstStored.await(10, TimeUnit.SECONDS)).isTrue();

            CompletableFuture<Void> second = CompletableFuture.runAsync(() -> inTransaction.executeWithoutResult(
                    t -> store(bonzed, "b-1", mail("b-1", "y-1", "<hello@mail.test>"))));

            assertThatExceptionOfType(TimeoutException.class).as("the owner's groups change one store at a time")
                    .isThrownBy(() -> second.get(1, TimeUnit.SECONDS));
            commitFirst.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
            assertThat(groupOf(bonzed, "b-1")).isEqualTo(groupOf(tien, "t-1"));
        } finally {
            commitFirst.countDown();
            jdbc.sql("DELETE FROM conversation WHERE account_id IN (:accounts)")
                    .param("accounts", List.of(tien, bonzed)).update();
        }
    }

    // Lock order account, owner, rows: a store that wrote its conversations before waiting for the owner could wait
    // for a store holding the owner's lock that wants those rows (review BE-80, HIGH).
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void aStoreWaitsForTheOwnersGroupsBeforeWritingAnyConversation() throws Exception {
        TransactionTemplate inTransaction = new TransactionTemplate(transactionManager);
        inTransaction.executeWithoutResult(t -> store(tien, "t-1", mail("t-1", "x-1", "<a@mail.test>")));
        CountDownLatch ownerLocked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            CompletableFuture<Void> holder = CompletableFuture.runAsync(() -> inTransaction.executeWithoutResult(t -> {
                jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                        .param("key", "thread-groups:" + owner).query().singleRow();
                ownerLocked.countDown();
                await(release);
            }));
            assertThat(ownerLocked.await(10, TimeUnit.SECONDS)).isTrue();
            CompletableFuture<Void> storing = CompletableFuture.runAsync(() -> inTransaction.executeWithoutResult(
                    t -> store(tien, "t-1", mail("t-1", "x-2", "<b@mail.test>"))));
            assertThatExceptionOfType(TimeoutException.class).isThrownBy(() -> storing.get(1, TimeUnit.SECONDS));

            Boolean free = inTransaction.execute(t -> jdbc.sql("""
                    SELECT true FROM conversation WHERE account_id = :account AND external_conversation_id = 't-1'
                    FOR UPDATE NOWAIT
                    """).param("account", tien).query(Boolean.class).single());

            assertThat(free).as("the waiting store holds no row of the conversation").isTrue();
            release.countDown();
            holder.get(10, TimeUnit.SECONDS);
            storing.get(10, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            jdbc.sql("DELETE FROM conversation WHERE account_id = :account").param("account", tien).update();
        }
    }

    private void store(UUID account, String thread, NormalizedMessage... messages) {
        store.store(account, new SyncBatch(List.of(new NormalizedConversation(thread, ConversationType.THREAD,
                "xin chào", null, List.of(), null)), List.of(messages), List.of(), new SyncCursor("next"), false));
    }

    private UUID groupOf(UUID account, String thread) {
        return jdbc.sql("""
                SELECT thread_group_id FROM conversation WHERE account_id = :account AND external_conversation_id = :thread
                """).param("account", account).param("thread", thread).query(UUID.class).single();
    }

    private UUID idOf(UUID account, String thread) {
        return jdbc.sql("SELECT id FROM conversation WHERE account_id = :account AND external_conversation_id = :thread")
                .param("account", account).param("thread", thread).query(UUID.class).single();
    }

    private static NormalizedMessage mail(String thread, String id, String rfcMessageId) {
        return new NormalizedMessage(id, thread, null, MessageDirection.INBOUND, MessageType.TEXT, "xin chào",
                MessageStatus.UNKNOWN, false, null, MONDAY, List.of(),
                rfcMessageId == null ? Map.of() : Map.of("rfcMessageId", rfcMessageId), null, null);
    }

    private static AccountSummary account(UUID id, UUID owner, ProviderType provider) {
        return new AccountSummary(id, owner, provider, AccountStatus.CONNECTED, id.toString(), true);
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

}
