package dev.sino.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.NicknameSync;
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
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

/**
 * {@link NicknameSync} every {@code sino.sync.nicknames.interval} (zalo-nicknames, NK-02, D-418), with a fake
 * connector and a real PostgreSQL. {@code sino.sync.live.scheduled=false} keeps {@code NicknameSyncSchedule} out, so
 * only {@link #sync} and {@link #syncAll} run, on the test's own call.
 */
@SpringBootTest(properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET,
        "sino.sync.live.scheduled=false" })
@Import({ TestcontainersConfiguration.class, SendingProviders.class })
@ActiveProfiles("test")
@RecordApplicationEvents
class NicknameSyncServiceTests {

    private static final Instant MONDAY = Instant.parse("2026-11-01T08:00:00Z");
    private static final NormalizedParticipant FRIEND = new NormalizedParticipant("8001", "An", null, false);
    private static final NormalizedParticipant OTHER_FRIEND = new NormalizedParticipant("8002", "Bình", null, false);
    private static final NormalizedParticipant ME = new NormalizedParticipant("7001", "Me", null, true);

    @Autowired
    private NicknameSync sync;
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
    @Qualifier("nickChatProvider")
    private FakeMessageProvider nickChat;
    @Autowired
    @Qualifier("chatProvider")
    private FakeMessageProvider plainChat;
    @Autowired
    private ApplicationEvents events;

    private UUID owner;

    @BeforeEach
    void aChatWithTwoFriends() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        nickChat.forgetNicknames();
    }

    @Test
    void aNicknameTheProviderHasIsWrittenAndPublishesOneChange() {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID direct = storeDirect(account, "8001", FRIEND);
        nickChat.nicknames().orElseThrow().set(context(account), "8001", "Mẹ");

        sync.sync(account);

        assertThat(jdbc.queryForObject("select nickname from conversation where id = ?", String.class, direct))
                .isEqualTo("Mẹ");
        assertThat(events.stream(ConversationChanged.class)).hasSize(1);
    }

    @Test
    void aFriendNoLongerInTheListClearsTheStoredNickname() {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID direct = storeDirect(account, "8001", FRIEND);
        jdbc.update("update conversation set nickname = 'Cũ' where id = ?", direct);

        sync.sync(account);

        assertThat(jdbc.queryForObject("select nickname from conversation where id = ?", String.class, direct))
                .isNull();
        assertThat(events.stream(ConversationChanged.class)).hasSize(1);
    }

    @Test
    void aRowAlreadyMatchingTheProviderPublishesNoEvent() {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID direct = storeDirect(account, "8001", FRIEND);
        jdbc.update("update conversation set nickname = 'Mẹ' where id = ?", direct);
        nickChat.nicknames().orElseThrow().set(context(account), "8001", "Mẹ");

        sync.sync(account);

        assertThat(events.stream(ConversationChanged.class)).isEmpty();
    }

    @Test
    void twoFriendsAreBothWrittenInOneSync() {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID direct1 = storeDirect(account, "8001", FRIEND);
        UUID direct2 = storeDirect(account, "8002", OTHER_FRIEND);
        nickChat.nicknames().orElseThrow().set(context(account), "8001", "Mẹ");
        nickChat.nicknames().orElseThrow().set(context(account), "8002", "Ba");

        sync.sync(account);

        assertThat(jdbc.queryForObject("select nickname from conversation where id = ?", String.class, direct1))
                .isEqualTo("Mẹ");
        assertThat(jdbc.queryForObject("select nickname from conversation where id = ?", String.class, direct2))
                .isEqualTo("Ba");
        assertThat(events.stream(ConversationChanged.class)).hasSize(2);
    }

    @Test
    void syncAllSkipsAnAccountThatMustBeConnectedAgain() {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID direct = storeDirect(account, "8001", FRIEND);
        jdbc.update("update conversation set nickname = 'Cũ' where id = ?", direct);
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", account);

        sync.syncAll();

        assertThat(jdbc.queryForObject("select nickname from conversation where id = ?", String.class, direct))
                .isEqualTo("Cũ");
        assertThat(events.stream(ConversationChanged.class)).isEmpty();
    }

    @Test
    void syncAllSkipsAnAccountWhoseProviderHasNoNicknames() {
        UUID account = connectChat(SendingProviders.CHAT);
        UUID direct = storeDirect(account, "8001", FRIEND);
        jdbc.update("update conversation set nickname = 'Cũ' where id = ?", direct);

        sync.syncAll();

        assertThat(jdbc.queryForObject("select nickname from conversation where id = ?", String.class, direct))
                .isEqualTo("Cũ");
        assertThat(plainChat.nicknameSets()).isEmpty();
    }

    @Test
    void syncAllSkipsADisabledAccount() {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID direct = storeDirect(account, "8001", FRIEND);
        jdbc.update("update conversation set nickname = 'Cũ' where id = ?", direct);
        jdbc.update("update connected_account set status = 'DISABLED' where id = ?", account);

        sync.syncAll();

        assertThat(jdbc.queryForObject("select nickname from conversation where id = ?", String.class, direct))
                .isEqualTo("Cũ");
    }

    private UUID connectChat(String provider) {
        UUID id = accounts.save(ConnectedAccount.register(owner, ProviderType.of(provider), "7001", "Me", null, null))
                .id();
        credentials.save(id, new TokenCredentials("{\"session\": \"sample\"}"), null);
        return id;
    }

    private dev.sino.provider.spi.ProviderContext context(UUID accountId) {
        return new dev.sino.provider.spi.ProviderContext(accountId, "7001",
                new TokenCredentials("{\"session\": \"sample\"}"));
    }

    private UUID storeDirect(UUID accountId, String externalId, NormalizedParticipant friend) {
        NormalizedConversation thread = new NormalizedConversation(externalId, ConversationType.DIRECT,
                friend.displayName(), null, List.of(friend, ME), null);
        NormalizedMessage hello = new NormalizedMessage("m-" + externalId, externalId, friend.externalParticipantId(),
                MessageDirection.INBOUND, MessageType.TEXT, "Chào bạn", MessageStatus.UNKNOWN, false, null, MONDAY,
                List.of(), Map.of(), null, null);
        SyncBatch batch = new SyncBatch(List.of(thread), List.of(hello), List.of(), new SyncCursor("next"), false);
        transactions.executeWithoutResult(t -> store.store(accountId, batch));
        return jdbc.queryForObject("select id from conversation where account_id = ? and external_conversation_id = ?",
                UUID.class, accountId, externalId);
    }

}
