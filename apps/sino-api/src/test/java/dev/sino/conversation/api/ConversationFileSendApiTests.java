package dev.sino.conversation.api;

import static dev.sino.sticker.domain.ImageFixtures.png;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
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
import dev.sino.provider.spi.OutgoingFile;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Sending a picture or a file from the computer into a chat (zalo-send-files ZF-05, chat-file-send, D-370…D-373):
 * {@code POST /api/conversations/{id}/messages} as {@code multipart/form-data}, on the whole application and a real
 * PostgreSQL, with fake connectors that send files or not.
 */
@SpringBootTest(properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, SendingProviders.class })
@ActiveProfiles("test")
class ConversationFileSendApiTests {

    private static final Instant MONDAY = Instant.parse("2026-10-19T08:00:00Z");
    private static final NormalizedParticipant FRIEND = new NormalizedParticipant("8001", "An", null, false);
    private static final NormalizedParticipant ME = new NormalizedParticipant("7001", "Me", null, true);
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F'};

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
    @Qualifier("pictureChatProvider")
    private FakeMessageProvider fileChat;
    @Autowired
    @Qualifier("chatProvider")
    private FakeMessageProvider textChat;

    private UUID owner;
    private UUID conversation;
    private final UUID clientMessageId = UUID.randomUUID();

    @BeforeEach
    void aChatWithAFriend() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        fileChat.forgetSends();
        textChat.forgetSends();
        conversation = storeConversation(connectChat(SendingProviders.PICTURE_CHAT));
    }

    // The zip of 3.6 MB the user sent by hand on 2026-10-21, which came back "Không gửi được".
    @Test
    void aZipGoesOutAsAFileAndIsStoredWithItsNameAndSize() throws Exception {
        byte[] zip = Arrays.copyOf(new byte[] {'P', 'K', 3, 4}, 3_600_000);

        sendFile("Sticker_16_mau_va_prompt.zip", "application/x-zip-compressed", zip).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SENT"))
                .andExpect(jsonPath("$.text").value("Sticker_16_mau_va_prompt.zip"))
                .andExpect(jsonPath("$.attachments[0].fileName").value("Sticker_16_mau_va_prompt.zip"))
                .andExpect(jsonPath("$.attachments[0].sizeBytes").value(3_600_000));

        assertThat(fileChat.sentMessages()).singleElement().satisfies(command -> {
            assertThat(command.textContent()).isNull();
            assertThat(command.file().kind()).isEqualTo(OutgoingFile.Kind.FILE);
            assertThat(command.file().fileName()).isEqualTo("Sticker_16_mau_va_prompt.zip");
            assertThat(command.file().bytes()).isEqualTo(zip);
        });
        assertThat(jdbc.queryForMap("select type, text_content, status from message where client_message_id = ?",
                clientMessageId)).containsEntry("type", "FILE").containsEntry("status", "SENT");
    }

    @Test
    void aPastedPngIsAPhoto() throws Exception {
        byte[] picture = png(40, 30);

        sendFile("image.png", "image/png", picture).andExpect(status().isCreated())
                .andExpect(jsonPath("$.text").value("[Ảnh]"));

        assertThat(fileChat.sentMessages()).singleElement().satisfies(command -> {
            assertThat(command.file().kind()).isEqualTo(OutgoingFile.Kind.PHOTO);
            assertThat(command.file().mediaType()).isEqualTo("image/png");
            assertThat(command.file().fileName()).isEqualTo("image.png");
        });
        assertThat(jdbc.queryForObject("select type from message where client_message_id = ?", String.class,
                clientMessageId)).isEqualTo("IMAGE");
    }

    // The bytes decide, and zca-js picks its path by the ending of the name (D-371).
    @Test
    void aJpegNamedAsAPngGoesAsAJpegAndAFileNamedAsAPictureGetsBin() throws Exception {
        sendFile("chup.png", "image/png", JPEG).andExpect(status().isCreated());
        sendFile(UUID.randomUUID(), "ghi-chu.jpg", "image/jpeg", "not a picture".getBytes(StandardCharsets.UTF_8))
                .andExpect(status().isCreated());

        assertThat(fileChat.sentMessages()).extracting(command -> command.file().fileName())
                .containsExactly("chup.jpg", "ghi-chu.jpg.bin");
        assertThat(fileChat.sentMessages()).extracting(command -> command.file().kind())
                .containsExactly(OutgoingFile.Kind.PHOTO, OutgoingFile.Kind.FILE);
    }

    @Test
    void aPictureAbove10MbIsRefusedAndNothingIsSent() throws Exception {
        byte[] large = Arrays.copyOf(JPEG, OutgoingFile.MAX_PHOTO_BYTES + 1);

        sendFile("lon.jpg", "image/jpeg", large).andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("FILE_TOO_LARGE"))
                .andExpect(jsonPath("$.maxBytes").value(OutgoingFile.MAX_PHOTO_BYTES));

        assertThat(fileChat.sentMessages()).isEmpty();
        assertThat(rows()).isZero();
    }

    @Test
    void anEmptyFileIsRefused() throws Exception {
        sendFile("rong.txt", "text/plain", new byte[0]).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("FILE_EMPTY"));

        assertThat(fileChat.sentMessages()).isEmpty();
    }

    @Test
    void aChatWhoseConnectorSendsNoFilesRefusesIt() throws Exception {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        conversation = storeConversation(connectChat(SendingProviders.CHAT));

        sendFile("bao-cao.pdf", "application/pdf", "%PDF-1.7".getBytes(StandardCharsets.US_ASCII))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REPLY_NOT_ALLOWED"));

        assertThat(textChat.sentMessages()).isEmpty();
        assertThat(rows()).isZero();
    }

    @Test
    void sendingAgainWithTheSameIdAnswersTheMessageWithoutSendingTwice() throws Exception {
        byte[] pdf = "%PDF-1.7".getBytes(StandardCharsets.US_ASCII);
        sendFile("bao-cao.pdf", "application/pdf", pdf).andExpect(status().isCreated());

        sendFile("bao-cao.pdf", "application/pdf", pdf).andExpect(status().isOk());

        assertThat(fileChat.sentMessages()).hasSize(1);
    }

    @Test
    void theConversationSaysWhetherFilesCanBeSent() throws Exception {
        mvc.perform(get("/api/conversations/{id}", conversation).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.reply.canSendFiles").value(true));
    }

    @Test
    void aRequestWithoutAFileIsRefused() throws Exception {
        mvc.perform(multipart("/api/conversations/{id}/messages", conversation)
                .param("clientMessageId", clientMessageId.toString()).with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isBadRequest());

        assertThat(fileChat.sentMessages()).isEmpty();
    }

    private ResultActions sendFile(String name, String type, byte[] bytes) throws Exception {
        return sendFile(clientMessageId, name, type, bytes);
    }

    private ResultActions sendFile(UUID id, String name, String type, byte[] bytes) throws Exception {
        return mvc.perform(multipart("/api/conversations/{id}/messages", conversation)
                .file(new MockMultipartFile("file", name, type, bytes))
                .param("clientMessageId", id.toString())
                .with(user("owner@sino.test")).with(csrf()));
    }

    private int rows() {
        return jdbc.queryForObject("select count(*) from message where client_message_id is not null", Integer.class);
    }

    private UUID connectChat(String provider) {
        UUID id = accounts.save(ConnectedAccount.register(owner, ProviderType.of(provider), "7001", "Me", null, null))
                .id();
        credentials.save(id, new TokenCredentials("{\"session\": \"sample\"}"), null);
        return id;
    }

    private UUID storeConversation(UUID accountId) {
        NormalizedConversation thread = new NormalizedConversation("8001", ConversationType.DIRECT, "An", null,
                List.of(FRIEND, ME), null);
        NormalizedMessage hello = new NormalizedMessage("m-1", "8001", FRIEND.externalParticipantId(),
                MessageDirection.INBOUND, MessageType.TEXT, "Chào bạn", MessageStatus.UNKNOWN, false, null, MONDAY,
                List.of(), Map.of(), null, null);
        SyncBatch batch = new SyncBatch(List.of(thread), List.of(hello), List.of(), new SyncCursor("next"), false);
        transactions.executeWithoutResult(t -> store.store(accountId, batch));
        return jdbc.queryForObject("select id from conversation where account_id = ?", UUID.class, accountId);
    }

}
