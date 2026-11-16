package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.conversation.ConversationStore;
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
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Setting a nickname of a 1-1 chat through {@code PATCH /api/conversations/{id}} (zalo-nicknames, NK-02, D-414,
 * D-416), on the whole application and a real PostgreSQL, with a fake connector that declares {@code NICKNAMES} and
 * agrees or refuses as each test tells it.
 */
@SpringBootTest(properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, SendingProviders.class })
@ActiveProfiles("test")
class ConversationNicknameApiTests {

    private static final Instant MONDAY = Instant.parse("2026-11-01T08:00:00Z");
    private static final NormalizedParticipant FRIEND = new NormalizedParticipant("8001", "An", null, false);
    private static final NormalizedParticipant ME = new NormalizedParticipant("7001", "Me", null, true);

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
    @Qualifier("nickChatProvider")
    private FakeMessageProvider nickChat;
    @Autowired
    @Qualifier("chatProvider")
    private FakeMessageProvider plainChat;

    private UUID owner;

    @BeforeEach
    void aChatWithAFriend() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        nickChat.forgetSends();
        nickChat.forgetNicknames();
        plainChat.forgetSends();
    }

    @Test
    void settingANicknameAsksTheProviderFirstAndIsReflectedByGet() throws Exception {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID conversation = storeDirect(account);

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"nickname\": \"Mẹ\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("Mẹ"))
                .andExpect(jsonPath("$.title").value("An"));
        assertThat(nickChat.nicknameSets()).containsExactly(new FakeMessageProvider.SetNickname("8001", "Mẹ"));

        mvc.perform(get("/api/conversations/{id}", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.nickname").value("Mẹ"));
    }

    @Test
    void theNicknameIsTrimmedAndControlCharactersAreStripped() throws Exception {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID conversation = storeDirect(account);

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"nickname\": \"  Mẹ\\t \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("Mẹ"));
    }

    @Test
    void anExplicitNullClearsAStoredNickname() throws Exception {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID conversation = storeDirect(account);
        nickChat.nicknames().orElseThrow().set(context(account), "8001", "Mẹ");
        jdbc.update("update conversation set nickname = 'Mẹ' where id = ?", conversation);

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"nickname\": null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value(nullValue()));
        assertThat(nickChat.nicknameSets()).last().isEqualTo(new FakeMessageProvider.SetNickname("8001", null));
    }

    @Test
    void leavingNicknameOutOfTheBodyLeavesItAsItIsWhileReadStillChanges() throws Exception {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID conversation = storeDirect(account);
        jdbc.update("update conversation set nickname = 'Mẹ' where id = ?", conversation);

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"read\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("Mẹ"));
        assertThat(nickChat.nicknameSets()).isEmpty();
    }

    @Test
    void aGroupIsRefusedWithoutCallingTheProvider() throws Exception {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID conversation = storeGroup(account);

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"nickname\": \"Nhóm vui\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NICKNAME_NOT_SUPPORTED"));
        assertThat(nickChat.nicknameSets()).isEmpty();
    }

    @Test
    void aProviderWithoutNicknamesIsRefusedWithoutCallingIt() throws Exception {
        UUID account = connectChat(SendingProviders.CHAT);
        UUID conversation = storeDirect(account);

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"nickname\": \"Mẹ\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NICKNAME_NOT_SUPPORTED"));
        assertThat(plainChat.nicknameSets()).isEmpty();
    }

    @Test
    void theProviderRefusingTheNicknameLeavesTheStoredOneAsItWas() throws Exception {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID conversation = storeDirect(account);
        jdbc.update("update conversation set nickname = 'Cũ' where id = ?", conversation);
        nickChat.failNextNicknameSet(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "not a friend"));

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"nickname\": \"Mới\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NICKNAME_REJECTED"));

        mvc.perform(get("/api/conversations/{id}", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.nickname").value("Cũ"));
    }

    @Test
    void theProviderBeingUnreachableIsA502AndLeavesTheStoredOneAsItWas() throws Exception {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID conversation = storeDirect(account);
        nickChat.failNextNicknameSet(new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "down"));

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"nickname\": \"Mới\"}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("NICKNAME_UNAVAILABLE"));
    }

    @Test
    void aNicknameAboveTheLimitIs400() throws Exception {
        UUID account = connectChat(SendingProviders.NICK_CHAT);
        UUID conversation = storeDirect(account);

        mvc.perform(patch("/api/conversations/{id}", conversation).with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"nickname\": \"" + "x".repeat(51) + "\"}"))
                .andExpect(status().isBadRequest());
        assertThat(nickChat.nicknameSets()).isEmpty();
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

    private UUID storeDirect(UUID accountId) {
        NormalizedConversation thread = new NormalizedConversation("8001", ConversationType.DIRECT, "An", null,
                List.of(FRIEND, ME), null);
        NormalizedMessage hello = new NormalizedMessage("m-1", "8001", FRIEND.externalParticipantId(),
                MessageDirection.INBOUND, MessageType.TEXT, "Chào bạn", MessageStatus.UNKNOWN, false, null, MONDAY,
                List.of(), Map.of(), null, null);
        SyncBatch batch = new SyncBatch(List.of(thread), List.of(hello), List.of(), new SyncCursor("next"), false);
        transactions.executeWithoutResult(t -> store.store(accountId, batch));
        return jdbc.queryForObject("select id from conversation where account_id = ?", UUID.class, accountId);
    }

    private UUID storeGroup(UUID accountId) {
        NormalizedConversation group = new NormalizedConversation("g-1", ConversationType.GROUP, "Nhóm vui bạn", null,
                List.of(FRIEND, ME), null);
        NormalizedMessage hello = new NormalizedMessage("m-1", "g-1", FRIEND.externalParticipantId(),
                MessageDirection.INBOUND, MessageType.TEXT, "Chào mọi người", MessageStatus.UNKNOWN, false, null,
                MONDAY, List.of(), Map.of(), null, null);
        SyncBatch batch = new SyncBatch(List.of(group), List.of(hello), List.of(), new SyncCursor("next"), false);
        transactions.executeWithoutResult(t -> store.store(accountId, batch));
        return jdbc.queryForObject("select id from conversation where account_id = ?", UUID.class, accountId);
    }

}
