package dev.sino.conversation.api;

import static dev.sino.sticker.domain.ImageFixtures.png;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.SentMessages;
import dev.sino.conversation.StoreResult;
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
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;
import dev.sino.sticker.application.StickerService;

/**
 * Sending a sticker of the library into a chat (ZS-05, sticker-send, D-351, D-352, D-356): {@code POST
 * /api/conversations/{id}/messages} with a {@code stickerId} instead of a text, on the whole application and a real
 * PostgreSQL, with fake connectors that send pictures or not.
 */
@SpringBootTest(properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, SendingProviders.class })
@ActiveProfiles("test")
class ConversationStickerSendApiTests {

    private static final Instant MONDAY = Instant.parse("2026-10-19T08:00:00Z");
    private static final NormalizedParticipant FRIEND = new NormalizedParticipant("8001", "An", null, false);
    private static final NormalizedParticipant ME = new NormalizedParticipant("7001", "Me", null, true);
    private static final String STICKER_TEXT = "[Sticker]";

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
    private StickerService stickers;

    @Autowired
    private SentMessages sentMessages;

    @Autowired
    @Qualifier("pictureChatProvider")
    private FakeMessageProvider pictureChat;

    @Autowired
    @Qualifier("chatProvider")
    private FakeMessageProvider textChat;

    @Autowired
    @Qualifier("mailProvider")
    private FakeMessageProvider mail;

    private UUID owner;
    private UUID account;
    private UUID conversation;
    private UUID sticker;
    private byte[] stickerFile;
    private final UUID clientMessageId = UUID.randomUUID();

    @BeforeEach
    void aChatWithAFriendAndAStickerInTheLibrary() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        jdbc.update("delete from sticker");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        pictureChat.forgetSends();
        textChat.forgetSends();
        mail.forgetSends();
        account = connectChat(SendingProviders.PICTURE_CHAT);
        conversation = storeConversation(account, inbound("m-1"));
        stickerFile = png(60, 40);
        sticker = stickers.upload(owner, "meo.png", null, stickerFile).id();
    }

    @Test
    void aStickerGoesOutAsAPictureAndComesBackAsTheStoredMessage() throws Exception {
        sendSticker(sticker, clientMessageId).andExpect(status().isCreated())
                .andExpect(jsonPath("$.direction").value("OUTBOUND"))
                .andExpect(jsonPath("$.status").value("SENT"))
                .andExpect(jsonPath("$.clientMessageId").value(clientMessageId.toString()))
                .andExpect(jsonPath("$.text").value(STICKER_TEXT))
                .andExpect(jsonPath("$.libraryStickerId").value(sticker.toString()));

        assertThat(pictureChat.sentMessages()).singleElement().satisfies(command -> {
            assertThat(command.externalConversationId()).isEqualTo("8001");
            assertThat(command.conversationType()).isEqualTo(ConversationType.DIRECT);
            assertThat(command.textContent()).isNull();
            assertThat(command.clientMessageId()).isEqualTo(clientMessageId);
            assertThat(command.image().bytes()).containsExactly(stickerFile);
            assertThat(command.image().mediaType()).isEqualTo("image/png");
            assertThat(command.image().fileName()).isEqualTo("sticker.png");
            assertThat(command.image().width()).isEqualTo(60);
            assertThat(command.image().height()).isEqualTo(40);
        });
        assertThat(jdbc.queryForMap("""
                select type, text_content, status, external_message_id, metadata ->> 'libraryStickerId' as sticker
                from message where client_message_id = ?
                """, clientMessageId)).containsEntry("type", "IMAGE").containsEntry("text_content", STICKER_TEXT)
                .containsEntry("status", "SENT").containsEntry("external_message_id", "sent-1")
                .containsEntry("sticker", sticker.toString());
    }

    @Test
    void theListOfMessagesNamesTheStickerOfAMessageSinoSent() throws Exception {
        sendSticker(sticker, clientMessageId).andExpect(status().isCreated());

        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.items[0].libraryStickerId").value(sticker.toString()))
                .andExpect(jsonPath("$.items[1].libraryStickerId").value(nullValue()));
    }

    // Zalo's own stickers keep the ID Zalo gave them under metadata stickerId; that is not a sticker of the library.
    @Test
    void aStickerOfZaloIsNotAStickerOfTheLibrary() throws Exception {
        NormalizedMessage zaloSticker = new NormalizedMessage("m-2", "8001", FRIEND.externalParticipantId(),
                MessageDirection.INBOUND, MessageType.UNKNOWN, "[Sticker]", MessageStatus.UNKNOWN, false, null,
                MONDAY.plusSeconds(5), List.of(), Map.of("zaloType", "chat.sticker", "stickerId", "10042"), null, null);
        storeConversation(account, zaloSticker);

        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.items[0].libraryStickerId").value(nullValue()));
    }

    @Test
    void aTextAndAStickerTogetherAreRefusedAndNothingIsSent() throws Exception {
        postJson("{\"text\": \"hi\", \"stickerId\": \"" + sticker + "\", \"clientMessageId\": \"" + clientMessageId + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(pictureChat.sentMessages()).isEmpty();
        assertThat(sentRows()).isEmpty();
    }

    @Test
    void neitherATextNorAStickerIsRefused() throws Exception {
        postJson("{\"clientMessageId\": \"" + clientMessageId + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        postJson("{\"text\": \"   \", \"clientMessageId\": \"" + clientMessageId + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(pictureChat.sentMessages()).isEmpty();
    }

    @Test
    void aStickerThatIsNotAUuidIsRefused() throws Exception {
        postJson("{\"stickerId\": \"meo\", \"clientMessageId\": \"" + clientMessageId + "\"}")
                .andExpect(status().isBadRequest());

        assertThat(pictureChat.sentMessages()).isEmpty();
    }

    @Test
    void aStickerOfAnotherOwnerOrNoneAtAllIsNotFoundAndNothingIsWritten() throws Exception {
        UUID another = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, 'another@sino.test', 'Another', 'ACTIVE', now(), now())", another);
        UUID theirs = stickers.upload(another, "cho.png", null, png(16, 16)).id();

        sendSticker(theirs, clientMessageId).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STICKER_NOT_FOUND"));
        sendSticker(UUID.randomUUID(), UUID.randomUUID()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STICKER_NOT_FOUND"));

        assertThat(pictureChat.sentMessages()).isEmpty();
        assertThat(sentRows()).isEmpty();
        jdbc.update("delete from sticker where user_id = ?", another);
        jdbc.update("delete from app_user where id = ?", another);
    }

    @Test
    void aConversationOfAProviderThatSendsOnlyTextRefusesAStickerAndNothingIsSent() throws Exception {
        UUID mailAccount = accounts.save(ConnectedAccount.register(owner, ProviderType.of(SendingProviders.MAIL),
                "me@mail.test", "Me", null, null)).id();
        credentials.save(mailAccount, new OAuth2Credentials("ya29.sample", null,
                Set.of("openid", SendingProviders.READ_SCOPE, SendingProviders.SEND_SCOPE)), "1//sample");
        UUID mailConversation = storeConversation(mailAccount, inbound("m-9"));

        mvc.perform(post("/api/conversations/{id}/messages", mailConversation).with(user("owner@sino.test"))
                .with(csrf()).contentType(APPLICATION_JSON).content(stickerBody(sticker, clientMessageId)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REPLY_NOT_ALLOWED"))
                .andExpect(jsonPath("$.state").value("NOT_SUPPORTED"));

        assertThat(mail.sentMessages()).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from message where client_message_id = ?", Integer.class,
                clientMessageId)).isZero();
    }

    @Test
    void aChatWhoseConnectorSendsOnlyTextRefusesAStickerToo() throws Exception {
        UUID textAccount = connectChat(SendingProviders.CHAT);
        UUID textConversation = storeConversation(textAccount, inbound("m-9"));

        mvc.perform(post("/api/conversations/{id}/messages", textConversation).with(user("owner@sino.test"))
                .with(csrf()).contentType(APPLICATION_JSON).content(stickerBody(sticker, clientMessageId)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.state").value("NOT_SUPPORTED"));

        assertThat(textChat.sentMessages()).isEmpty();
    }

    @Test
    void sendingAgainWithTheSameClientMessageIdSendsOnceAndAnswers200() throws Exception {
        sendSticker(sticker, clientMessageId).andExpect(status().isCreated());

        sendSticker(sticker, clientMessageId).andExpect(status().isOk())
                .andExpect(jsonPath("$.clientMessageId").value(clientMessageId.toString()))
                .andExpect(jsonPath("$.libraryStickerId").value(sticker.toString()));

        assertThat(pictureChat.sentMessages()).hasSize(1);
        assertThat(sentRows()).hasSize(1);
    }

    // A retry after a flaky network must find the message that went, not an error about a sticker deleted since.
    @Test
    void aRetryOfAStickerThatWentOutAnswers200EvenIfTheStickerWasDeletedMeanwhile() throws Exception {
        sendSticker(sticker, clientMessageId).andExpect(status().isCreated());
        stickers.delete(owner, sticker);

        sendSticker(sticker, clientMessageId).andExpect(status().isOk())
                .andExpect(jsonPath("$.libraryStickerId").value(sticker.toString()));

        assertThat(pictureChat.sentMessages()).hasSize(1);
    }

    @Test
    void aStickerThatFailedStaysWithItsStickerAndTheSameIdSendsItAgain() throws Exception {
        pictureChat.failNextSends(new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "refused"));

        sendSticker(sticker, clientMessageId).andExpect(status().isBadGateway());

        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.items[0].status").value("FAILED"))
                .andExpect(jsonPath("$.items[0].libraryStickerId").value(sticker.toString()));
        sendSticker(sticker, clientMessageId).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SENT"))
                .andExpect(jsonPath("$.libraryStickerId").value(sticker.toString()));
        assertThat(sentRows()).hasSize(1);
        assertThat(pictureChat.sentMessages()).hasSize(2);
    }

    // The outcome is asked of the provider later from the stored message: a text "[Sticker]", the picture is not kept.
    @Test
    void aStickerWhoseOutcomeIsUnknownIsSettledLaterAndKeepsItsSticker() throws Exception {
        pictureChat.failNextSends(new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "no answer"));
        sendSticker(sticker, clientMessageId).andExpect(status().isGatewayTimeout());
        pictureChat.found(clientMessageId, "z-77");

        sentMessages.reconcile(account);

        assertThat(pictureChat.searchedAttempts()).singleElement().satisfies(search -> {
            assertThat(search.command().textContent()).isEqualTo(STICKER_TEXT);
            assertThat(search.command().image()).isNull();
        });
        assertThat(jdbc.queryForMap("""
                select status, external_message_id, metadata ->> 'libraryStickerId' as sticker
                from message where client_message_id = ?
                """, clientMessageId)).containsEntry("status", "SENT").containsEntry("external_message_id", "z-77")
                .containsEntry("sticker", sticker.toString());
    }

    // Zalo pushes the account's own picture back (selfListen) as a photo with the same ID: it is the same message, and it
    // is still the sticker, which Sino shows from its own library whatever address Zalo gives the photo (D-352).
    @Test
    void theEchoOfZaloAfterTheSendIsTheSameMessageAndKeepsTheSticker() throws Exception {
        sendSticker(sticker, clientMessageId).andExpect(status().isCreated());

        StoreResult first = store(echo("sent-1"));
        StoreResult again = store(echo("sent-1"));

        assertThat(first.newMessages()).isZero();
        assertThat(again.updatedMessages()).as("the same echo again changes nothing").isZero();
        assertThat(jdbc.queryForList("""
                select client_message_id, metadata ->> 'libraryStickerId' as sticker, metadata ->> 'imageUrl' as image
                from message where conversation_id = ? and external_message_id = 'sent-1'
                """, conversation)).singleElement().satisfies(row -> {
                    assertThat(row.get("client_message_id")).isEqualTo(clientMessageId);
                    assertThat(row.get("sticker")).isEqualTo(sticker.toString());
                    assertThat(row.get("image")).isEqualTo("https://photo.example/echo.jpg");
                });
        mvc.perform(get("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.items[0].libraryStickerId").value(sticker.toString()));
    }

    // The echo can come before the answer of the send: the message the sync brought in stays, and takes both the
    // clientMessageId and the sticker of the message Sino wrote (D-131, D-352).
    @Test
    void theEchoOfZaloBeforeTheSendIsSettledIsTheSameMessageAndKeepsTheSticker() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        pictureChat.holdNextSend(entered, release);
        CompletableFuture<Integer> sending = CompletableFuture.supplyAsync(() -> {
            try {
                return sendSticker(sticker, clientMessageId).andReturn().getResponse().getStatus();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();

        store(echo("sent-1"));
        release.countDown();

        assertThat(sending.get(10, TimeUnit.SECONDS)).isEqualTo(201);
        assertThat(jdbc.queryForList("""
                select client_message_id, status, metadata ->> 'libraryStickerId' as sticker
                from message where conversation_id = ? and external_message_id = 'sent-1'
                """, conversation)).singleElement().satisfies(row -> {
                    assertThat(row.get("client_message_id")).isEqualTo(clientMessageId);
                    assertThat(row.get("sticker")).isEqualTo(sticker.toString());
                });
        assertThat(sentRows()).hasSize(1);
    }

    @Test
    void theConversationSaysWhetherPicturesCanBeSent() throws Exception {
        mvc.perform(get("/api/conversations/{id}", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.reply.state").value("READY"))
                .andExpect(jsonPath("$.reply.canSendImages").value(true));

        UUID textConversation = storeConversation(connectChat(SendingProviders.CHAT), inbound("m-9"));
        mvc.perform(get("/api/conversations/{id}", textConversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.reply.state").value("READY"))
                .andExpect(jsonPath("$.reply.canSendImages").value(false));
    }

    @Test
    void anAccountThatMustBeReconnectedCannotSendPicturesEither() throws Exception {
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", account);

        mvc.perform(get("/api/conversations/{id}", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.reply.state").value("ACCOUNT_UNAVAILABLE"))
                .andExpect(jsonPath("$.reply.canSendImages").value(false));
        sendSticker(sticker, clientMessageId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.state").value("ACCOUNT_UNAVAILABLE"));
        assertThat(pictureChat.sentMessages()).isEmpty();
    }

    private ResultActions sendSticker(UUID stickerId, UUID id) throws Exception {
        return postJson(stickerBody(stickerId, id));
    }

    private ResultActions postJson(String json) throws Exception {
        return mvc.perform(post("/api/conversations/{id}/messages", conversation).with(user("owner@sino.test"))
                .with(csrf()).contentType(APPLICATION_JSON).content(json));
    }

    private static String stickerBody(UUID stickerId, UUID id) {
        return "{\"stickerId\": \"" + stickerId + "\", \"clientMessageId\": \"" + id + "\"}";
    }

    // The messages Sino sent in the conversation.
    private List<Map<String, Object>> sentRows() {
        return jdbc.queryForList("""
                select external_message_id, status from message
                where conversation_id = ? and client_message_id is not null
                """, conversation);
    }

    private UUID connectChat(String provider) {
        UUID id = accounts.save(ConnectedAccount.register(owner, ProviderType.of(provider), "7001", "Me", null, null))
                .id();
        credentials.save(id, new TokenCredentials("{\"session\": \"sample\"}"), null);
        return id;
    }

    private StoreResult store(NormalizedMessage message) {
        return transactions.execute(t -> store.store(account, batch(message)));
    }

    private UUID storeConversation(UUID accountId, NormalizedMessage message) {
        transactions.executeWithoutResult(t -> store.store(accountId, batch(message)));
        return jdbc.queryForObject("select id from conversation where account_id = ?", UUID.class, accountId);
    }

    private static SyncBatch batch(NormalizedMessage message) {
        NormalizedConversation thread = new NormalizedConversation("8001", ConversationType.DIRECT, "An", null,
                List.of(FRIEND, ME), null);
        return new SyncBatch(List.of(thread), List.of(message), List.of(), new SyncCursor("next"), false);
    }

    private static NormalizedMessage inbound(String id) {
        return new NormalizedMessage(id, "8001", FRIEND.externalParticipantId(), MessageDirection.INBOUND,
                MessageType.TEXT, "Chào bạn", MessageStatus.UNKNOWN, false, null, MONDAY, List.of(), Map.of(), null,
                null);
    }

    // What Zalo pushes back for a picture the account sent: a photo with an address of Zalo's own.
    private static NormalizedMessage echo(String id) {
        return new NormalizedMessage(id, "8001", ME.externalParticipantId(), MessageDirection.OUTBOUND,
                MessageType.IMAGE, "[Ảnh]", MessageStatus.SENT, true, null, MONDAY.plusSeconds(30), List.of(),
                Map.of("zaloType", "chat.photo", "imageUrl", "https://photo.example/echo.jpg"), null, null);
    }

}
