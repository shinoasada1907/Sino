package dev.sino.conversation.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.AccountDirectory;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.StoreResult;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.NormalizedReaction;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/** Storing reactions (zalo-reactions, RX-06, D-384, D-385) in a real PostgreSQL; each test is rolled back. */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, JdbcConversationStore.class, ConversationSummaries.class,
        ThreadGroups.class })
@ActiveProfiles("test")
class JdbcConversationStoreReactionTests {

    private static final Instant T0 = Instant.parse("2026-11-10T08:00:00Z");
    private static final Instant T1 = T0.plusSeconds(60);
    private static final Instant T2 = T0.plusSeconds(120);
    private static final NormalizedParticipant FRIEND = new NormalizedParticipant("200", "Bình", null, false);
    private static final NormalizedParticipant SELF = new NormalizedParticipant("100", "Tôi", null, true);

    @MockitoBean
    private AccountDirectory directory;

    @Autowired
    private ConversationStore store;

    @Autowired
    private JdbcClient jdbc;

    private final UUID account = UUID.randomUUID();

    @Test
    void aReactionIsStoredOnAMessageAndTheUnreadStateStaysAsItWas() {
        store.store(account, messages(inbound("m-1", T0)));
        Map<String, Object> before = messageRow("m-1");

        StoreResult result = store.store(account, reactions(reaction("m-1", "200", false, ":>", T1)));

        assertThat(result.reactionsChanged()).isEqualTo(1);
        assertThat(result.newMessages() + result.updatedMessages()).isZero();
        assertThat(result.conversationIds()).hasSize(1);
        assertThat(reactionRows("m-1")).containsExactly(List.of("200", "Bình", false, ":>"));
        assertThat(messageRow("m-1")).as("is_read, sent_at and the rest are untouched").isEqualTo(before);
        assertThat(jdbc.sql("select last_message_at from conversation").query(Instant.class).single())
                .as("the conversation does not move up").isEqualTo(T0);
    }

    @Test
    void aNewerReactionOfTheSameReactorReplacesTheOldOne() {
        store.store(account, messages(inbound("m-1", T0)));
        store.store(account, reactions(reaction("m-1", "200", false, ":>", T1)));

        store.store(account, reactions(reaction("m-1", "200", false, "/-heart", T2)));

        assertThat(reactionRows("m-1")).containsExactly(List.of("200", "Bình", false, "/-heart"));
    }

    @Test
    void anOlderReactionArrivingLateDoesNotOverwriteANewerOne() {
        store.store(account, messages(inbound("m-1", T0)));
        store.store(account, reactions(reaction("m-1", "200", false, "/-heart", T2)));

        StoreResult result = store.store(account, reactions(reaction("m-1", "200", false, ":>", T1)));

        assertThat(result.reactionsChanged()).isZero();
        assertThat(reactionRows("m-1")).containsExactly(List.of("200", "Bình", false, "/-heart"));
    }

    @Test
    void aRemovalKeepsTheRowWithoutACodeSoAnOlderReactionCannotComeBack() {
        store.store(account, messages(inbound("m-1", T0)));
        store.store(account, reactions(reaction("m-1", "200", false, ":>", T1)));

        store.store(account, reactions(reaction("m-1", "200", false, "", T2)));
        StoreResult late = store.store(account, reactions(reaction("m-1", "200", false, ":>", T1)));

        assertThat(late.reactionsChanged()).isZero();
        assertThat(jdbc.sql("select count(*) from message_reaction").query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select code from message_reaction").query(String.class).optional()).isEmpty();
    }

    @Test
    void reactionsOfTwoReactorsAndAnOwnOneAreKeptApart() {
        store.store(account, messages(inbound("m-1", T0)));

        store.store(account, reactions(reaction("m-1", "200", false, ":>", T1),
                reaction("m-1", "300", false, ":>", T1), reaction("m-1", "100", true, "/-heart", T2)));

        assertThat(reactionRows("m-1")).hasSize(3);
        assertThat(jdbc.sql("select reactor_external_id from message_reaction where is_self")
                .query(String.class).single()).isEqualTo("100");
    }

    @Test
    void aReactionOnAMessageSinoDoesNotHaveIsDroppedWithoutFailingThePage() {
        store.store(account, messages(inbound("m-1", T0)));

        StoreResult result = store.store(account, reactions(reaction("m-unknown", "200", false, ":>", T1),
                reaction("m-1", "200", false, ":>", T1)));

        assertThat(result.reactionsChanged()).isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from message_reaction").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void aReactionBelongsToTheAccountsOwnMessagesOnly() {
        store.store(account, messages(inbound("m-1", T0)));

        StoreResult other = store.store(UUID.randomUUID(), reactions(reaction("m-1", "200", false, ":>", T1)));

        assertThat(other.reactionsChanged()).isZero();
        assertThat(jdbc.sql("select count(*) from message_reaction").query(Long.class).single()).isZero();
    }

    @Test
    void aReactionInTheSameBatchAsItsMessageIsApplied() {
        SyncBatch page = new SyncBatch(List.of(chat()), List.of(inbound("m-1", T0)), List.of(),
                List.of(reaction("m-1", "200", false, ":>", T1)), new SyncCursor("next"), false);

        StoreResult result = store.store(account, page);

        assertThat(result.newMessages()).isEqualTo(1);
        assertThat(result.reactionsChanged()).isEqualTo(1);
    }

    @Test
    void deletingTheMessageDeletesItsReactions() {
        store.store(account, messages(inbound("m-1", T0)));
        store.store(account, reactions(reaction("m-1", "200", false, ":>", T1)));

        jdbc.sql("delete from message").update();

        assertThat(jdbc.sql("select count(*) from message_reaction").query(Long.class).single()).isZero();
    }

    private static NormalizedConversation chat() {
        return new NormalizedConversation("thread-1", ConversationType.DIRECT, "Bình", null,
                List.of(FRIEND, SELF), T0);
    }

    private static NormalizedMessage inbound(String id, Instant at) {
        return new NormalizedMessage(id, "thread-1", "200", MessageDirection.INBOUND, MessageType.TEXT, "Chào",
                MessageStatus.UNKNOWN, false, null, at, List.of(), Map.of(), null, null);
    }

    private static NormalizedReaction reaction(String message, String reactor, boolean self, String code,
            Instant at) {
        return new NormalizedReaction("thread-1", message, reactor, "200".equals(reactor) ? "Bình" : null, self,
                code, at);
    }

    private static SyncBatch messages(NormalizedMessage... messages) {
        return new SyncBatch(List.of(chat()), List.of(messages), List.of(), new SyncCursor("next"), false);
    }

    private static SyncBatch reactions(NormalizedReaction... reactions) {
        return new SyncBatch(List.of(chat()), List.of(), List.of(), List.of(reactions), new SyncCursor("next"),
                false);
    }

    private Map<String, Object> messageRow(String externalId) {
        return jdbc.sql("""
                select is_read, provider_read, sent_at, text_content, status, updated_at
                from message where external_message_id = :id
                """).param("id", externalId).query().singleRow();
    }

    private List<List<Object>> reactionRows(String externalId) {
        return jdbc.sql("""
                select r.reactor_external_id, r.reactor_name, r.is_self, r.code
                from message_reaction r join message m on m.id = r.message_id
                where m.external_message_id = :id order by r.reactor_external_id
                """).param("id", externalId)
                .query((rs, n) -> java.util.Arrays.<Object>asList(rs.getString(1), rs.getString(2), rs.getBoolean(3),
                        rs.getString(4)))
                .list();
    }

}
