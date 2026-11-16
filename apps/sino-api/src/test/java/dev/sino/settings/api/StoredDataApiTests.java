package dev.sino.settings.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.ByteBuffer;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import dev.sino.conversation.ConversationStats;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * {@code GET /api/settings/storage} (D-403) on the whole application and a real PostgreSQL, with mail stored by the real
 * {@link ConversationStore}: the messages of the user's accounts and their size with the stickers, never another user's
 * nor those of a removed account.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class StoredDataApiTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice", null,
            false);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private ConnectedAccountRepository accounts;

    @Autowired
    private ConversationStore store;

    @Autowired
    private ConversationStats stats;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;
    private UUID bob;

    @BeforeEach
    void startFromNoData() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from sync_checkpoint");
        jdbc.update("delete from connected_account");
        jdbc.update("delete from task");
        jdbc.update("delete from sticker");
        jdbc.update("delete from sticker_pack");
        jdbc.update("delete from note");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        bob = users.save(new AppUser("bob@storage.test", "Bob")).id();
    }

    @Test
    void aUserWithNothingStoredHasNothing() throws Exception {
        mvc.perform(get("/api/settings/storage").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"messages\": 0, \"bytes\": 0}", true));
    }

    @Test
    void nobodySignedInGetsNoNumbers() throws Exception {
        mvc.perform(get("/api/settings/storage")).andExpect(status().isUnauthorized());
    }

    @Test
    void theMessagesOfEveryAccountOfTheUserAreCountedAndSized() throws Exception {
        UUID mailbox = connect(owner, "owner-sub");
        UUID work = connect(owner, "work-sub");
        store(mailbox, message("m-1", "Xin chào"), message("m-2", "Hẹn gặp lại"));
        store(work, message("w-1", "Báo cáo tuần"));

        long bytes = bytes(storage());

        assertThat(messages(storage())).isEqualTo(3);
        assertThat(bytes).isEqualTo(stats.storedBytes(mailbox) + stats.storedBytes(work)).isPositive();
    }

    @Test
    void anotherUserAndARemovedAccountAreNotCounted() throws Exception {
        UUID mailbox = connect(owner, "owner-sub");
        store(mailbox, message("m-1", "Xin chào"), message("m-2", "Hẹn gặp lại"));
        String before = storage();

        UUID bobs = connect(bob, "bob-sub");
        store(bobs, message("b-1", "Thư của Bob"));
        sticker(bob, 50_000);
        ConnectedAccount old = ConnectedAccount.register(owner, GMAIL, "old-sub", "Old", null, "old@gmail.test");
        UUID removed = accounts.save(old).id();
        store(removed, message("o-1", "Thư cũ"));
        old.remove(Instant.parse("2026-03-01T00:00:00Z"));
        accounts.save(old);

        assertThat(storage()).isEqualTo(before);
        assertThat(messages(before)).isEqualTo(2);
    }

    @Test
    void theStickersOfTheUserAreInTheBytes() throws Exception {
        sticker(owner, 120_000);
        sticker(owner, 30_000);

        mvc.perform(get("/api/settings/storage").with(user("owner@sino.test")))
                .andExpect(content().json("{\"messages\": 0, \"bytes\": 150000}", true));
    }

    @Test
    void aLongerBodyTakesMoreBytes() throws Exception {
        UUID shortOne = connect(owner, "short-sub");
        UUID longOne = connect(owner, "long-sub");
        // UUIDs do not compress much, so the body stays thousands of bytes once PostgreSQL has compressed it.
        String longText = IntStream.range(0, 200).mapToObj(i -> UUID.randomUUID().toString())
                .collect(Collectors.joining(" "));
        store(shortOne, message("s-1", "Ngắn"));
        store(longOne, message("s-1", longText));

        assertThat(stats.storedBytes(longOne) - stats.storedBytes(shortOne)).isGreaterThan(3_000);
        assertThat(stats.storedBytes(UUID.randomUUID())).isZero();
    }

    private String storage() throws Exception {
        return mvc.perform(get("/api/settings/storage").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages").isNumber())
                .andReturn().getResponse().getContentAsString();
    }

    private static long messages(String json) {
        return ((Number) JsonPath.read(json, "$.messages")).longValue();
    }

    private static long bytes(String json) {
        return ((Number) JsonPath.read(json, "$.bytes")).longValue();
    }

    private UUID connect(UUID user, String externalAccountId) {
        return accounts.save(ConnectedAccount.register(user, GMAIL, externalAccountId, "Account", null,
                externalAccountId + "@gmail.test")).id();
    }

    private void store(UUID account, NormalizedMessage... messages) {
        NormalizedConversation thread = new NormalizedConversation("thread", ConversationType.THREAD, "Chủ đề", null,
                List.of(ALICE), null);
        transactions.executeWithoutResult(t -> store.store(account, new SyncBatch(List.of(thread),
                List.of(messages), List.of(), new SyncCursor("next"), false)));
    }

    private static NormalizedMessage message(String id, String text) {
        return new NormalizedMessage(id, "thread", ALICE.externalParticipantId(), MessageDirection.INBOUND,
                MessageType.TEXT, text, MessageStatus.UNKNOWN, true, null, Instant.parse("2026-10-05T08:00:00Z"),
                List.of(), Map.of(), null, null);
    }

    /** A sticker row of {@code size} bytes; the picture itself is not needed, its size is kept beside it. */
    private void sticker(UUID user, long size) {
        byte[] sha256 = new byte[32];
        UUID id = UUID.randomUUID();
        System.arraycopy(ByteBuffer.allocate(16).putLong(id.getMostSignificantBits())
                .putLong(id.getLeastSignificantBits()).array(), 0, sha256, 0, 16);
        jdbc.update("""
                insert into sticker (id, user_id, name, media_type, kind, width, height, size_bytes, sha256, created_at)
                values (?, ?, 'Mèo', 'image/png', 'STATIC', 64, 64, ?, ?, ?)
                """, id, user, size, sha256, Timestamp.from(Instant.parse("2026-10-21T00:00:00Z")));
    }

}
