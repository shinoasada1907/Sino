package dev.sino.conversation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

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
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
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
 * The full content of one message (BE-55, F06 spec {@code mail-content}) through HTTP on the whole application and a
 * real PostgreSQL: HTML cleaned on the way out, and mail stored before Sino kept HTML read again from a connector each
 * test scripts.
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
                        List.of(new Address(null, "owner@gmail.test")), List.of(), List.of())))
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
                .content("m-1", new MessageContent("<p>Báo giá</p>", null)).build());
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
    void aSignedOutCallerGetsNothing() throws Exception {
        store(message("m-1", "Báo giá", "<p>Báo giá</p>"));

        mvc.perform(get("/api/conversations/{id}/messages/{messageId}/body", conversationId(), messageId("m-1")))
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

    private static NormalizedMessage message(String id, String text, String html) {
        return new NormalizedMessage(id, "report", "alice@example.test", MessageDirection.INBOUND, MessageType.TEXT,
                text, MessageStatus.UNKNOWN, true, null, MONDAY, List.of(), Map.of(), null, html);
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

    /** One connector for the whole context, whose answers each test sets. */
    static final class SwitchableConnector implements MessageProvider {

        static final ProviderType TYPE = ProviderType.of("fake-body");

        private volatile FakeMessageProvider delegate = FakeMessageProvider.builder(TYPE.value()).build();

        void use(FakeMessageProvider provider) {
            delegate = provider;
        }

        FakeMessageProvider delegate() {
            return delegate;
        }

        @Override
        public ProviderType type() {
            return TYPE;
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

    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Connectors {

        @Bean
        SwitchableConnector switchableConnector() {
            return new SwitchableConnector();
        }

    }

}
