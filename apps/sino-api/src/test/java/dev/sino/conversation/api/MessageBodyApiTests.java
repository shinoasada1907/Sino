package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import dev.sino.provider.ProviderKind;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.conversation.ConversationChanged;
import dev.sino.conversation.ConversationStore;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.AttachmentContent;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.NormalizedRecipients;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

/**
 * The full content of one message (BE-55, BE-56, F06 specs {@code mail-content}, {@code attachment-download}) through
 * HTTP on the whole application and a real PostgreSQL: HTML cleaned on the way out, embedded pictures and files
 * through Sino, and mail stored before Sino kept HTML read again, from a connector each test scripts.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, MessageBodyApiTests.Connectors.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
@RecordApplicationEvents
class MessageBodyApiTests {

    private static final Instant MONDAY = Instant.parse("2026-10-05T08:00:00Z");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice", null,
            false);
    private static final NormalizedAttachment PDF = new NormalizedAttachment("part-2", "Báo giá tháng 10.pdf",
            "application/pdf", 182000L, null, null, null);
    private static final NormalizedAttachment LOGO = new NormalizedAttachment("part-9", "logo.png", "image/png", 2048L,
            null, null, "logo@shop");
    private static final String FILE = "/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}";
    private static final long LARGEST = 25L * 1024 * 1024;
    private static final String ATTACK = "<p>Báo giá</p><script>alert(1)</script>"
            + "<img src=\"https://track.example.com/p.gif\" onerror=\"alert(2)\">";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private ConversationStore store;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private SwitchableConnector connector;

    @Autowired
    private ConnectedAccountRepository accounts;

    @Autowired
    private ApplicationEvents events;

    private UUID owner;
    private UUID account;

    @BeforeEach
    void startFromAnEmptyInbox() {
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        owner = jdbc.queryForObject("select id from app_user where email = 'owner@sino.test'", UUID.class);
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value()).build());
        account = registration.register(new RegisterAccountCommand(owner, SwitchableConnector.TYPE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null),
                new TokenCredentials("fake-body-token-1"), null));
    }

    @Test
    void htmlComesOutCleanedAndTellsOfPicturesFromTheWeb() throws Exception {
        store(message("m-1", "Báo giá", ATTACK));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1"))
                .with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.format").value("HTML"))
                .andExpect(jsonPath("$.html").value(containsString("<p>Báo giá</p>")))
                .andExpect(jsonPath("$.html").value(not(containsString("script"))))
                .andExpect(jsonPath("$.html").value(not(containsString("onerror"))))
                .andExpect(jsonPath("$.remoteImages").value(true));
        mvc.perform(get("/api/conversations/{id}/messages", conversationId()).with(apiUser()))
                .andExpect(jsonPath("$.items[0].bodyFormat").value("HTML"))
                .andExpect(jsonPath("$.items[0].text").value("Báo giá"));
        assertThat(jdbc.queryForObject("select html_content from message", String.class))
                .as("the HTML as it came stays stored, so a stricter cleaner applies to old mail too")
                .isEqualTo(ATTACK);
    }

    @Test
    void aMessageWithoutHtmlHasOnlyItsText() throws Exception {
        store(message("m-1", "Chào", null));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1"))
                .with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.format").value("TEXT"))
                .andExpect(jsonPath("$.html").value(nullValue()))
                .andExpect(jsonPath("$.remoteImages").value(false));
        assertThat(connector.delegate().contentCalls()).isZero();
        assertThat(events.stream(ConversationChanged.class)).isEmpty();
    }

    @Test
    void mailStoredBeforeIsReadAgainOnceAndThenKept() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .content("m-1", new MessageContent(ATTACK, new NormalizedRecipients(
                        List.of(new Address(null, "owner@gmail.test")), List.of(), List.of()), List.of()))
                .build());
        storeBeforeHtml(message("m-1", "Báo giá", null));
        mvc.perform(get("/api/conversations/{id}/messages", conversationId()).with(apiUser()))
                .andExpect(jsonPath("$.items[0].bodyFormat").value("UNCHECKED"))
                .andExpect(jsonPath("$.items[0].to").value(nullValue()));

        for (int open = 0; open < 2; open++) {
            mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(),
                    messageId("m-1")).with(apiUser()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.format").value("HTML"))
                    .andExpect(jsonPath("$.html").value(not(containsString("script"))))
                    .andExpect(jsonPath("$.remoteImages").value(true));
        }

        assertThat(connector.delegate().contentCalls()).as("read again once, then kept").isEqualTo(1);
        assertThat(events.stream(ConversationChanged.class)).as("the list of the open tabs is read again, once")
                .singleElement().satisfies(changed -> assertThat(changed.conversationId()).isEqualTo(conversationId()));
        mvc.perform(get("/api/conversations/{id}/messages", conversationId()).with(apiUser()))
                .andExpect(jsonPath("$.items[0].bodyFormat").value("HTML"))
                .andExpect(jsonPath("$.items[0].to[0].address").value("owner@gmail.test"));
    }

    @Test
    void mailStoredBeforeThatTheProviderNoLongerHasShowsItsText() throws Exception {
        storeBeforeHtml(message("m-1", "Chào", null));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1"))
                .with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.format").value("TEXT"))
                .andExpect(jsonPath("$.html").value(nullValue()));
        assertThat(jdbc.queryForObject("select body_format from message", String.class)).isEqualTo("TEXT");
    }

    @Test
    void aProviderThatFailsLeavesTheMessageToTryAgain(CapturedOutput output) throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .contentFailure(new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "Gmail is down"))
                .build());
        storeBeforeHtml(message("m-1", "Báo giá", null));
        UUID message = messageId("m-1");

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), message)
                .with(apiUser()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("MESSAGE_CONTENT_UNAVAILABLE"));

        assertThat(jdbc.queryForObject("select body_format from message", String.class)).isEqualTo("UNCHECKED");
        assertThat(output.getAll()).contains("Message " + message + " could not be read again: PROVIDER_UNAVAILABLE");
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .content("m-1", new MessageContent("<p>Báo giá</p>", null, List.of())).build());
        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), message)
                .with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.html").value("<p>Báo giá</p>"));
    }

    @Test
    void anAccountWhoseAccessExpiredCannotReadAgain() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .contentFailure(new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "Reconnect")).build());
        storeBeforeHtml(message("m-1", "Báo giá", null));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1"))
                .with(apiUser()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("MESSAGE_CONTENT_UNAVAILABLE"));
    }

    @Test
    void anAccountWhoseConnectorIsGoneCannotReadAgain() throws Exception {
        account = accounts.save(ConnectedAccount.register(owner, ProviderType.of("gone"), "gone-1", "Gone", null,
                null)).id();
        storeBeforeHtml(message("m-1", "Báo giá", null));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1"))
                .with(apiUser()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("MESSAGE_CONTENT_UNAVAILABLE"));
    }

    @Test
    void aMessageOfAnotherConversationIsNotFound() throws Exception {
        store(message("m-1", "Báo giá", "<p>Báo giá</p>"));
        store(new NormalizedConversation("other", ConversationType.THREAD, "Khác", null, List.of(ALICE), null),
                new NormalizedMessage("m-2", "other", "alice@example.test", MessageDirection.INBOUND,
                        MessageType.TEXT, "Khác", MessageStatus.UNKNOWN, true, null, MONDAY, List.of(), Map.of(),
                        null, "<p>Khác</p>"));

        for (UUID message : List.of(messageId("m-2"), UUID.randomUUID())) {
            mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), message)
                    .with(apiUser()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"));
        }
        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", UUID.randomUUID(), messageId("m-1"))
                .with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CONVERSATION_NOT_FOUND"));
    }

    @Test
    void anEmbeddedPictureIsShownThroughSinoAndIsNoFileOfTheMessage() throws Exception {
        store(message("m-1", "Báo giá", "<p>Báo giá <img src=\"cid:logo@shop\"><img src=\"cid:missing\"></p>",
                PDF, LOGO));
        UUID message = messageId("m-1");

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), message)
                .with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.html").value("<p>Báo giá <img src=\"/api/conversations/" + conversationId()
                        + "/messages/" + message + "/attachments/" + attachmentId("logo@shop") + "?inline=true\"></p>"))
                .andExpect(jsonPath("$.remoteImages").value(false));
        mvc.perform(get("/api/conversations/{id}/messages", conversationId()).with(apiUser()))
                .andExpect(jsonPath("$.items[0].attachments.length()").value(1))
                .andExpect(jsonPath("$.items[0].attachments[0].fileName").value("Báo giá tháng 10.pdf"));
        assertThat(jdbc.queryForObject("select has_attachments from conversation", Boolean.class)).isTrue();
    }

    @Test
    void anEmbeddedPictureIsFoundWhateverTheCaseOrTheEscapesOfItsCid() throws Exception {
        store(message("m-1", "Chào", "<p><img src=\"cid:LOGO@Shop\"><img src=\"cid:logo%40shop\"></p>", LOGO));
        String picture = "/api/conversations/" + conversationId() + "/messages/" + messageId("m-1") + "/attachments/"
                + attachmentId("logo@shop") + "?inline=true";

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1"))
                .with(apiUser()))
                .andExpect(jsonPath("$.html").value("<p><img src=\"" + picture + "\"><img src=\"" + picture
                        + "\"></p>"));
    }

    @Test
    void aCidWithAPercentSignOfItsOwnIsFoundAsWritten() throws Exception {
        store(message("m-1", "Chào", "<p><img src=\"cid:a%41b@shop\"><img src=\"cid:a%2541b@shop\">"
                + "<img src=\"cid:aAb@shop\"></p>",
                new NormalizedAttachment("part-9", "logo.png", "image/png", 2048L, null, null, "a%41b@shop"),
                new NormalizedAttachment("part-8", "logo.png", "image/png", 2048L, null, null, "aAb@shop")));
        String files = "/api/conversations/" + conversationId() + "/messages/" + messageId("m-1") + "/attachments/";
        String percent = files + attachmentId("a%41b@shop") + "?inline=true";
        String plain = files + attachmentId("aAb@shop") + "?inline=true";

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1"))
                .with(apiUser()))
                .andExpect(jsonPath("$.html").value("<p><img src=\"" + percent + "\"><img src=\"" + percent
                        + "\"><img src=\"" + plain + "\"></p>"));
    }

    @Test
    void aPictureOnlyEmbeddedIsNoAttachmentOfTheConversation() throws Exception {
        store(message("m-1", "Chào", "<p><img src=\"cid:logo@shop\"></p>", LOGO));

        mvc.perform(get("/api/conversations/{id}/messages", conversationId()).with(apiUser()))
                .andExpect(jsonPath("$.items[0].attachments.length()").value(0));
        assertThat(jdbc.queryForObject("select has_attachments from conversation", Boolean.class)).isFalse();
    }

    @Test
    void mailStoredBeforeGetsItsEmbeddedPicturesWhenReadAgain() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .content("m-1", new MessageContent("<p><img src=\"cid:logo@shop\"></p>", null, List.of(LOGO)))
                .build());
        storeBeforeHtml(message("m-1", "Báo giá", null, PDF));
        UUID message = messageId("m-1");

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), message)
                .with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.html").value("<p><img src=\"/api/conversations/" + conversationId()
                        + "/messages/" + message + "/attachments/" + attachmentId("logo@shop")
                        + "?inline=true\"></p>"));
        assertThat(jdbc.queryForList("select file_name from attachment order by id", String.class))
                .as("the file stays, the picture comes").containsExactly("Báo giá tháng 10.pdf", "logo.png");
    }

    @Test
    void aFileComesThroughSinoAsADownloadUnderItsName() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .file("m-1", "part-2", new AttachmentContent("%PDF-1.7".getBytes(StandardCharsets.UTF_8), null))
                .build());
        store(message("m-1", "Báo giá", null, PDF));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}", conversationId(),
                messageId("m-1"), attachmentId("part-2")).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().bytes("%PDF-1.7".getBytes(StandardCharsets.UTF_8)))
                .andExpect(header().string("Content-Type", "application/pdf"))
                .andExpect(header().string("Content-Disposition", startsWith("attachment;")))
                .andExpect(header().string("Content-Disposition",
                        containsString("filename*=UTF-8''B%C3%A1o%20gi%C3%A1%20th%C3%A1ng%2010.pdf")))
                .andExpect(header().stringValues("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Security-Policy", "sandbox; default-src 'none'"))
                .andExpect(header().string("Cache-Control", containsString("no-store")));
        assertThat(jdbc.queryForObject("select count(*) from attachment", Long.class))
                .as("Sino stores no content of a file").isEqualTo(1);
    }

    @Test
    void anHtmlFileOrAPictureAskedAsAFileIsDownloadedNeverShown() throws Exception {
        NormalizedAttachment page = new NormalizedAttachment("part-3", "trang.html", "text/html", 40L, null, null,
                null);
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .file("m-1", "part-3", new AttachmentContent("<script>alert(1)</script>".getBytes(
                        StandardCharsets.UTF_8), "text/html"))
                .file("m-1", "part-9", new AttachmentContent(new byte[] { 1, 2 }, "image/png")).build());
        store(message("m-1", "Báo giá", null, page, LOGO));

        for (String part : List.of("part-3", "part-9")) {
            mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}",
                    conversationId(), messageId("m-1"), attachmentId(part)).with(apiUser()))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Disposition", startsWith("attachment;")))
                    .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                    .andExpect(header().string("Content-Security-Policy", "sandbox; default-src 'none'"));
        }
    }

    @Test
    void aFileWithoutTypeOrNameIsStillAFileToDownload() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .file("m-1", "part-4", new AttachmentContent(new byte[] { 7 }, null)).build());
        store(message("m-1", "Chào", null, new NormalizedAttachment("part-4", null, null, null, null, null, null)));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}", conversationId(),
                messageId("m-1"), attachmentId("part-4")).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/octet-stream"))
                .andExpect(header().string("Content-Disposition", "attachment"));
    }

    @Test
    void aFileNameCannotBreakTheHeader() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .file("m-1", "part-4", new AttachmentContent(new byte[] { 7 }, null)).build());
        store(message("m-1", "Chào", null, new NormalizedAttachment("part-4", "a\"b\r\nX-Evil: 1.pdf",
                "application/pdf", 1L, null, null, null)));

        mvc.perform(get(FILE, conversationId(), messageId("m-1"), attachmentId("part-4")).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", not(containsString("\n"))))
                .andExpect(header().string("Content-Disposition", not(containsString("\r"))))
                .andExpect(header().string("Content-Disposition",
                        containsString("filename*=UTF-8''a%22b%0D%0AX-Evil%3A%201.pdf")))
                .andExpect(header().doesNotExist("X-Evil"));
    }

    @Test
    void aFileWithoutAStoredTypeTakesTheTypeTheProviderGives() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .file("m-1", "part-4", new AttachmentContent(new byte[] { 7 }, "application/pdf"))
                .file("m-1", "part-5", new AttachmentContent(new byte[] { 8 }, null)).build());
        store(message("m-1", "Chào", null, new NormalizedAttachment("part-4", "a.pdf", null, 1L, null, null, null),
                new NormalizedAttachment("part-5", "b", "image/*", 1L, null, null, null)));

        mvc.perform(get(FILE, conversationId(), messageId("m-1"), attachmentId("part-4")).with(apiUser()))
                .andExpect(header().string("Content-Type", "application/pdf"));
        mvc.perform(get(FILE, conversationId(), messageId("m-1"), attachmentId("part-5")).with(apiUser()))
                .andExpect(header().string("Content-Type", "application/octet-stream"));
    }

    @Test
    void aFileLargerThan25MegabytesIsRefusedWithoutAskingTheProvider() throws Exception {
        store(message("m-1", "Phim", null, video("part-6", LARGEST + 1)));

        mvc.perform(get(FILE, conversationId(), messageId("m-1"), attachmentId("part-6")).with(apiUser()))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("ATTACHMENT_TOO_LARGE"));
        assertThat(connector.delegate().fileCalls()).as("the provider is not asked").isZero();
    }

    @Test
    void sinoCarriesAtMostTwoOfTheLargestFilesAtOnce() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .file("m-1", "part-1", new AttachmentContent(new byte[] { 1 }, null))
                .file("m-1", "part-2", new AttachmentContent(new byte[] { 2 }, null))
                .file("m-1", "part-3", new AttachmentContent(new byte[] { 3 }, null))
                .file("m-1", "part-9", new AttachmentContent(new byte[] { 9 }, "image/png")).build());
        store(message("m-1", "Phim", "<p><img src=\"cid:logo@shop\"></p>", video("part-1", LARGEST),
                video("part-2", null), video("part-3", 1L), LOGO));
        UUID conversation = conversationId();
        UUID message = messageId("m-1");
        List<UUID> large = List.of(attachmentId("part-1"), attachmentId("part-2"));
        CountDownLatch inside = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        connector.hold(inside, release);
        ExecutorService downloads = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> held = large.stream().map(attachment -> downloads.submit(() -> mvc.perform(
                    get(FILE, conversation, message, attachment).with(apiUser())).andReturn().getResponse()
                    .getStatus())).toList();
            assertThat(inside.await(10, TimeUnit.SECONDS))
                    .as("the largest file and one of unknown size, which counts as the largest").isTrue();

            mvc.perform(get(FILE, conversation, message, attachmentId("part-3")).with(apiUser()))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.code").value("ATTACHMENT_BUSY"));
            mvc.perform(get(FILE, conversation, message, attachmentId("logo@shop")).param("inline", "true")
                    .with(apiUser()))
                    .andExpect(status().isOk());
            release.countDown();
            for (Future<Integer> download : held) {
                assertThat(download.get(10, TimeUnit.SECONDS)).isEqualTo(200);
            }
            mvc.perform(get(FILE, conversation, message, attachmentId("part-3")).with(apiUser()))
                    .andExpect(status().isOk());
        } finally {
            release.countDown();
            downloads.shutdownNow();
        }
    }

    @Test
    void anEmbeddedPictureIsShownInline() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .file("m-1", "part-9", new AttachmentContent(new byte[] { 1, 2, 3 }, "image/png")).build());
        store(message("m-1", "Chào", "<p><img src=\"cid:logo@shop\"></p>", LOGO));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}", conversationId(),
                messageId("m-1"), attachmentId("logo@shop")).param("inline", "true").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().bytes(new byte[] { 1, 2, 3 }))
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("Content-Disposition", startsWith("inline")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().stringValues("Cache-Control", "max-age=86400, private"))
                .andExpect(header().doesNotExist("Pragma"));
    }

    @Test
    void aPictureTypeInAnyCaseOrWithParametersIsShownInline() throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .file("m-1", "part-7", new AttachmentContent(new byte[] { 1 }, null))
                .file("m-1", "part-8", new AttachmentContent(new byte[] { 2 }, null)).build());
        store(message("m-1", "Chào", "<p><img src=\"cid:a\"><img src=\"cid:b\"></p>",
                new NormalizedAttachment("part-7", null, "IMAGE/PNG", 1L, null, null, "a"),
                new NormalizedAttachment("part-8", null, "image/jpeg; name=\"b.jpg\"", 1L, null, null, "b")));

        for (String part : List.of("part-7", "part-8")) {
            mvc.perform(get(FILE, conversationId(), messageId("m-1"), attachmentId(part)).param("inline", "true")
                    .with(apiUser()))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Type", startsWith("image/")))
                    .andExpect(header().string("Content-Disposition", startsWith("inline")));
        }
    }

    @Test
    void onlyAPngJpegGifOrWebpPictureIsShownInline() throws Exception {
        NormalizedAttachment drawing = new NormalizedAttachment("part-5", "ve.svg", "image/svg+xml", 80L, null, null,
                "drawing@shop");
        store(message("m-1", "Chào", null, drawing, PDF));

        for (String part : List.of("part-5", "part-2")) {
            mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}",
                    conversationId(), messageId("m-1"), attachmentId(part)).param("inline", "true").with(apiUser()))
                    .andExpect(status().isUnprocessableContent())
                    .andExpect(jsonPath("$.code").value("ATTACHMENT_NOT_INLINE"));
        }
        assertThat(connector.delegate().fileCalls()).as("the provider is not asked").isZero();
    }

    @Test
    void aFileOfAnotherMessageOrNoneIsNotFound() throws Exception {
        store(message("m-1", "Báo giá", null, PDF));
        store(new NormalizedConversation("other", ConversationType.THREAD, "Khác", null, List.of(ALICE), null),
                new NormalizedMessage("m-2", "other", "alice@example.test", MessageDirection.INBOUND,
                        MessageType.MIXED, "Khác", MessageStatus.UNKNOWN, true, null, MONDAY, List.of(
                                new NormalizedAttachment("part-7", "khac.pdf", "application/pdf", 9L, null, null,
                                        null)), Map.of(), null, null));
        store(new NormalizedMessage("m-3", "report", "alice@example.test", MessageDirection.INBOUND, MessageType.MIXED,
                "Bản sửa", MessageStatus.UNKNOWN, true, null, MONDAY.plusSeconds(60), List.of(
                        new NormalizedAttachment("part-8", "sua.pdf", "application/pdf", 9L, null, null, null)),
                Map.of(), null, null));

        for (UUID attachment : List.of(attachmentId("part-7"), attachmentId("part-8"), UUID.randomUUID())) {
            mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}",
                    conversationId(), messageId("m-1"), attachment).with(apiUser()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("ATTACHMENT_NOT_FOUND"));
        }
        // A conversation of the inbox opens no file of a message elsewhere, whoever's it is.
        mvc.perform(get(FILE, conversationId(), messageId("m-2"), attachmentId("part-7")).with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ATTACHMENT_NOT_FOUND"));
        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}", UUID.randomUUID(),
                messageId("m-1"), attachmentId("part-2")).with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CONVERSATION_NOT_FOUND"));
    }

    @Test
    void aProviderThatCannotGiveTheFileIsABadGateway(CapturedOutput output) throws Exception {
        connector.use(FakeMessageProvider.builder(SwitchableConnector.TYPE.value())
                .fileFailure(new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "Gmail is down")).build());
        store(message("m-1", "Phim", null, video("part-1", LARGEST)));
        UUID attachment = attachmentId("part-1");

        for (int attempt = 0; attempt < 3; attempt++) {
            mvc.perform(get(FILE, conversationId(), messageId("m-1"), attachment).with(apiUser()))
                    .andExpect(status().isBadGateway())
                    .andExpect(jsonPath("$.code").value("ATTACHMENT_UNAVAILABLE"));
        }
        assertThat(output.getAll()).contains("Attachment " + attachment + " could not be read: PROVIDER_UNAVAILABLE");
    }

    @Test
    void anAccountWhoseConnectorIsGoneCannotGiveAFile() throws Exception {
        account = accounts.save(ConnectedAccount.register(owner, ProviderType.of("gone"), "gone-1", "Gone", null,
                null)).id();
        store(message("m-1", "Báo giá", null, PDF));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}", conversationId(),
                messageId("m-1"), attachmentId("part-2")).with(apiUser()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("ATTACHMENT_UNAVAILABLE"));
    }

    @Test
    void aSignedOutCallerGetsNothing() throws Exception {
        store(message("m-1", "Báo giá", "<p>Báo giá</p>"));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1")))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}", conversationId(),
                messageId("m-1"), UUID.randomUUID()))
                .andExpect(status().isUnauthorized());
    }

    private void store(NormalizedMessage message) {
        store(new NormalizedConversation("report", ConversationType.THREAD, "Báo giá", null, List.of(ALICE), null),
                message);
    }

    private void store(NormalizedConversation conversation, NormalizedMessage message) {
        transactions.executeWithoutResult(t -> store.store(account, new SyncBatch(List.of(conversation),
                List.of(message), List.of(), new SyncCursor("next"), false)));
    }

    // As mail stored before F06: no HTML kept, not known whether it has any.
    private void storeBeforeHtml(NormalizedMessage message) {
        store(message);
        jdbc.update("update message set body_format = 'UNCHECKED', html_content = null");
    }

    private UUID conversationId() {
        return jdbc.queryForObject("select id from conversation where external_conversation_id = 'report'",
                UUID.class);
    }

    private UUID messageId(String externalId) {
        return jdbc.queryForObject("select id from message where external_message_id = ?", UUID.class, externalId);
    }

    private UUID attachmentId(String externalIdOrContentId) {
        return jdbc.queryForObject("select id from attachment where external_attachment_id = ? or content_id = ?",
                UUID.class, externalIdOrContentId, externalIdOrContentId);
    }

    private static NormalizedMessage message(String id, String text, String html, NormalizedAttachment... files) {
        return new NormalizedMessage(id, "report", "alice@example.test", MessageDirection.INBOUND,
                files.length == 0 ? MessageType.TEXT : MessageType.MIXED, text, MessageStatus.UNKNOWN, true, null,
                MONDAY, List.of(files), Map.of(), null, html);
    }

    private static NormalizedAttachment video(String id, Long size) {
        return new NormalizedAttachment(id, id + ".mp4", "video/mp4", size, null, null, null);
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

    /** One connector for the whole context, whose answers each test sets. */
    static final class SwitchableConnector implements MessageProvider {

        static final ProviderType TYPE = ProviderType.of("fake-body");

        private volatile FakeMessageProvider delegate = FakeMessageProvider.builder(TYPE.value()).build();
        private volatile CountDownLatch inside;
        private volatile CountDownLatch release;

        void use(FakeMessageProvider provider) {
            delegate = provider;
            hold(null, null);
        }

        /** The first downloads, as many as {@code inside} counts, count it down, then wait for {@code release}. */
        void hold(CountDownLatch inside, CountDownLatch release) {
            this.inside = inside;
            this.release = release;
        }

        FakeMessageProvider delegate() {
            return delegate;
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
            return delegate.capabilities();
        }

        @Override
        public AccountProfile getAccountProfile(ProviderContext context) {
            return delegate.getAccountProfile(context);
        }

        @Override
        public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
            return delegate.fetchUpdates(context, cursor);
        }

        @Override
        public Optional<MessageContent> fetchMessageContent(ProviderContext context, String externalMessageId) {
            return delegate.fetchMessageContent(context, externalMessageId);
        }

        @Override
        public AttachmentContent fetchAttachment(ProviderContext context, String externalMessageId,
                String externalAttachmentId) {
            CountDownLatch held = release;
            if (held != null && inside.getCount() > 0) {
                inside.countDown();
                try {
                    held.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException stopped) {
                    Thread.currentThread().interrupt();
                }
            }
            return delegate.fetchAttachment(context, externalMessageId, externalAttachmentId);
        }

    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Connectors {

        @Bean
        SwitchableConnector switchableConnector() {
            return new SwitchableConnector();
        }

    }

}
