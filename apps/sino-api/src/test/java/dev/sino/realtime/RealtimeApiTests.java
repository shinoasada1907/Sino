package dev.sino.realtime;

import static dev.sino.provider.FakeMessageProvider.message;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.Browser;
import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.conversation.ConversationStore;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderKind;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;
import dev.sino.sync.MailStored;

/**
 * The event stream (BE-50) through real HTTP on a random port: the browser signs in, opens the stream like an
 * EventSource does, and reads its lines as they come. Short heartbeat and a limit of two streams to keep it quick.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = { "sino.realtime.heartbeat=PT0.2S", "sino.realtime.max-streams-per-user=2" })
@Import({ TestcontainersConfiguration.class, RealtimeApiTests.Connectors.class })
@ActiveProfiles("test")
class RealtimeApiTests {

    private static final ProviderType FAKE = ProviderType.of("fake-realtime");
    private static final Duration WAIT = Duration.ofSeconds(10);

    @LocalServerPort
    private int port;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private ApplicationEventPublisher events;

    @Autowired
    private SwitchableProvider connector;

    @Autowired
    private ConversationStore store;

    private final List<EventStream> opened = new ArrayList<>();
    private Browser browser;
    private UUID owner;
    private UUID otherUser;

    @BeforeEach
    void signIn() {
        jdbc.update("delete from sync_checkpoint");
        jdbc.update("delete from conversation");
        jdbc.update("delete from connected_account");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        otherUser = users.save(new AppUser("other@example.com", "Other")).id();
        connector.use(twoPages().build());
        browser = new Browser("http://localhost:" + port);
        assertThat(browser.signIn("owner@sino.test", "test-owner-password", false).status()).isEqualTo(204);
    }

    @AfterEach
    void closeStreams() {
        opened.forEach(EventStream::close);
    }

    @Test
    void withoutASessionTheStreamIsUnauthorized() throws Exception {
        try (EventStream anonymous = EventStream.open(port, null)) {
            assertThat(anonymous.status()).isEqualTo(401);
        }
    }

    @Test
    void aStreamStartsWithTheReconnectDelayAndStaysAliveWithComments() throws Exception {
        EventStream stream = open();

        assertThat(stream.status()).isEqualTo(200);
        assertThat(stream.contentType()).startsWith("text/event-stream");
        assertThat(stream.header("X-Accel-Buffering")).isEqualTo("no");
        assertThat(stream.nextLine(WAIT)).isEqualTo("retry:3000");
        assertThat(stream.linesWithin(Duration.ofMillis(900))).as("comment lines every 200 ms").contains(":");
    }

    @Test
    void storedMailIsSentToTheStreamsOfItsOwnerOnly() throws Exception {
        UUID mine = connect(owner);
        UUID theirs = connect(otherUser);
        EventStream stream = open();
        UUID conversation = UUID.randomUUID();

        transactions.executeWithoutResult(status -> events.publishEvent(
                new MailStored(theirs, Set.of(UUID.randomUUID()), 1, true, Instant.now())));
        transactions.executeWithoutResult(status -> events.publishEvent(
                new MailStored(mine, Set.of(conversation), 2, true, Instant.now())));

        Event event = stream.nextEvent(WAIT);
        assertThat(event.name()).as("the other owner's event never came first").isEqualTo("conversations.changed");
        assertThat(event.data()).contains("\"type\":\"conversations.changed\"", "\"accountId\":\"" + mine + "\"",
                "\"conversationIds\":[\"" + conversation + "\"]", "\"newInbound\":2", "\"source\":\"sync\"");
    }

    // D-189: the web shows a thread found in two accounts of the owner as one row, under the ID of its group (F05b).
    @Test
    void aCopyOfAThreadInTwoAccountsIsToldUnderTheIdOfItsGroup() throws Exception {
        UUID first = connect(owner);
        UUID second = connect(owner);
        UUID group = stored(first, "t-1");
        UUID copy = stored(second, "b-1");
        EventStream stream = open();

        transactions.executeWithoutResult(status -> events.publishEvent(
                new MailStored(second, Set.of(copy), 1, true, Instant.now())));

        assertThat(stream.nextEvent(WAIT).data()).contains("\"accountId\":\"" + second + "\"",
                "\"conversationIds\":[\"" + group + "\"]");
    }

    @Test
    void aRolledBackChangeSendsNothing() throws Exception {
        UUID mine = connect(owner);
        EventStream stream = open();

        transactions.executeWithoutResult(status -> {
            events.publishEvent(new MailStored(mine, Set.of(UUID.randomUUID()), 7, true, Instant.now()));
            status.setRollbackOnly();
        });
        transactions.executeWithoutResult(status -> events.publishEvent(
                new MailStored(mine, Set.of(UUID.randomUUID()), 1, false, Instant.now())));

        Event event = stream.nextEvent(WAIT);
        assertThat(event.data()).as("the rolled back one was never sent").contains("\"newInbound\":1",
                "\"source\":\"import\"");
    }

    @Test
    void aStreamBeyondTheLimitClosesTheOldestAndTheOthersStillHear() throws Exception {
        UUID mine = connect(owner);
        EventStream first = open();
        EventStream second = open();
        EventStream third = open();

        assertThat(first.ended(WAIT)).isTrue();
        transactions.executeWithoutResult(status -> events.publishEvent(
                new MailStored(mine, Set.of(UUID.randomUUID()), 1, true, Instant.now())));
        assertThat(second.nextEvent(WAIT).name()).isEqualTo("conversations.changed");
        assertThat(third.nextEvent(WAIT).name()).isEqualTo("conversations.changed");
    }

    @Test
    void aFailedImportTellsTheBrowser() throws Exception {
        UUID account = connect(owner);
        connector.use(twoPages().failOnCall(1, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"))
                .build());
        EventStream stream = open();

        assertThat(browser.send("POST", "/api/accounts/" + account + "/initial-sync", "{\"range\": \"DAYS_90\"}",
                true).status()).isEqualTo(202);

        assertThat(stream.nextEvent(WAIT).name()).as("published outside any transaction").isEqualTo("account.changed");
        assertThat(jdbc.queryForObject("select import_status from sync_checkpoint where account_id = ?", String.class,
                account)).isEqualTo("FAILED");
    }

    @Test
    void aSyncErrorThatComesAndGoesTellsTheBrowser() throws Exception {
        UUID account = imported();
        EventStream stream = open();

        connector.use(twoPages().failOnCall(1, new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "no"))
                .build());
        assertThat(browser.send("POST", "/api/accounts/" + account + "/sync", null, true).status()).isEqualTo(202);
        assertThat(stream.nextEvent(WAIT).name()).as("the error came").isEqualTo("account.changed");

        connector.use(twoPages().build());
        assertThat(browser.send("POST", "/api/accounts/" + account + "/sync", null, true).status()).isEqualTo(202);
        assertThat(stream.nextEvent(WAIT).name()).as("the error went").isEqualTo("account.changed");
    }

    @Test
    void turningOffOrRemovingAnAccountTellsTheBrowser() throws Exception {
        UUID account = connect(owner);
        EventStream stream = open();

        assertThat(browser.send("PATCH", "/api/accounts/" + account, "{\"enabled\": false}", true).status())
                .isEqualTo(200);
        assertThat(stream.nextEvent(WAIT).data()).contains("\"type\":\"account.changed\"", account.toString());

        assertThat(browser.send("DELETE", "/api/accounts/" + account, null, true).status()).isEqualTo(204);
        assertThat(stream.nextEvent(WAIT).data()).as("its owner comes with the event")
                .contains("\"type\":\"account.changed\"", account.toString());
    }

    @Test
    void anImportAndAChangeByTheUserTellTheBrowserWithoutAnyMailContent() throws Exception {
        UUID account = connect(owner);
        // Opened after connecting: an account.changed can only come from the import.
        EventStream stream = open();

        assertThat(browser.send("POST", "/api/accounts/" + account + "/initial-sync", "{\"range\": \"DAYS_90\"}",
                true).status()).isEqualTo(202);
        List<Event> seen = stream.eventsUntil(WAIT, "conversations.changed", "account.changed");
        assertThat(seen).anySatisfy(event -> assertThat(event.data()).contains("\"source\":\"import\""));
        assertThat(seen).anySatisfy(event -> assertThat(event.name()).isEqualTo("account.changed"));
        assertThat(seen).allSatisfy(event -> assertThat(event.data()).doesNotContain("Message m-"));

        UUID conversation = jdbc.queryForObject("select id from conversation where account_id = ? limit 1",
                UUID.class, account);
        assertThat(browser.send("PATCH", "/api/conversations/" + conversation, "{\"read\": true}", true).status())
                .isEqualTo(200);
        assertThat(stream.nextEventWith(WAIT, "\"source\":\"user\"").data()).as("after the pages of the import")
                .contains("\"conversationIds\":[\"" + conversation + "\"]", "\"newInbound\":0");
        assertThat(browser.send("PATCH", "/api/conversations/" + conversation, "{\"archived\": true}", true)
                .status()).isEqualTo(200);
        assertThat(stream.nextEventWith(WAIT, "\"source\":\"user\"").data()).as("archived")
                .contains("\"conversationIds\":[\"" + conversation + "\"]");
        assertThat(jdbc.queryForObject("select count(*) from event_publication", Integer.class))
                .as("the stream is told without the event publication registry").isZero();
    }

    // One mail with the same Message-ID in every account it is stored for: their copies are one group (BE-80).
    private UUID stored(UUID account, String thread) {
        NormalizedMessage hello = new NormalizedMessage(thread + "-m", thread, null, MessageDirection.INBOUND,
                MessageType.TEXT, "xin chào", MessageStatus.UNKNOWN, false, null, Instant.now(), List.of(),
                Map.of("rfcMessageId", "<hello@mail.test>"), null, null);
        transactions.executeWithoutResult(status -> store.store(account, new SyncBatch(List.of(
                new NormalizedConversation(thread, ConversationType.THREAD, "xin chào", null, List.of(), null)),
                List.of(hello), List.of(), new SyncCursor("next"), false)));
        return jdbc.queryForObject("select id from conversation where account_id = ?", UUID.class, account);
    }

    private EventStream open() throws Exception {
        EventStream stream = EventStream.open(port, "JSESSIONID=" + browser.cookie("JSESSIONID"));
        opened.add(stream);
        return stream;
    }

    private static FakeMessageProvider.Builder twoPages() {
        return FakeMessageProvider.builder(FAKE.value())
                .page(message("m-1", Instant.now().minus(2, ChronoUnit.DAYS)))
                .page(message("m-2", Instant.now().minus(1, ChronoUnit.DAYS)));
    }

    // An account of the owner whose first import is DONE.
    private UUID imported() throws Exception {
        UUID account = connect(owner);
        assertThat(browser.send("POST", "/api/accounts/" + account + "/initial-sync", "{\"range\": \"DAYS_90\"}",
                true).status()).isEqualTo(202);
        long deadline = System.nanoTime() + WAIT.toNanos();
        while (!"DONE".equals(jdbc.queryForObject("select import_status from sync_checkpoint where account_id = ?",
                String.class, account))) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("The import did not end");
            }
            Thread.sleep(25);
        }
        return account;
    }

    private UUID connect(UUID user) {
        return registration.register(new RegisterAccountCommand(user, FAKE,
                new AccountProfile("fake-" + UUID.randomUUID(), "Fake", null, null),
                new TokenCredentials("fake-realtime-token"), null));
    }

    record Event(String name, String data) {
    }

    /** An EventSource of sorts: one GET kept open, its lines read as they come. */
    static final class EventStream implements AutoCloseable {

        private static final String END = "\u0000end";

        private final HttpClient client;
        private final HttpResponse<Stream<String>> response;
        private final BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        private final Thread reader;

        private EventStream(HttpClient client, HttpResponse<Stream<String>> response) {
            this.client = client;
            this.response = response;
            this.reader = Thread.ofVirtual().start(() -> {
                try (Stream<String> body = response.body()) {
                    body.forEach(lines::add);
                } catch (RuntimeException closed) {
                    // The test closed the stream.
                }
                lines.add(END);
            });
        }

        static EventStream open(int port, String cookie) throws IOException, InterruptedException {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port
                    + "/api/events/stream")).header("Accept", "text/event-stream").GET();
            if (cookie != null) {
                request.header("Cookie", cookie);
            }
            HttpClient client = HttpClient.newHttpClient();
            return new EventStream(client, client.send(request.build(), HttpResponse.BodyHandlers.ofLines()));
        }

        int status() {
            return response.statusCode();
        }

        String contentType() {
            return response.headers().firstValue("Content-Type").orElse("");
        }

        String header(String name) {
            return response.headers().firstValue(name).orElse(null);
        }

        String nextLine(Duration wait) throws InterruptedException {
            String line = lines.poll(wait.toMillis(), TimeUnit.MILLISECONDS);
            if (line == null || END.equals(line)) {
                throw new AssertionError("No line came");
            }
            return line;
        }

        List<String> linesWithin(Duration wait) throws InterruptedException {
            List<String> seen = new ArrayList<>();
            long deadline = System.nanoTime() + wait.toNanos();
            while (System.nanoTime() < deadline) {
                String line = lines.poll(10, TimeUnit.MILLISECONDS);
                if (line != null && !END.equals(line)) {
                    seen.add(line);
                }
            }
            return seen;
        }

        /** The next event with a name; comment and retry lines are skipped. */
        Event nextEvent(Duration wait) throws InterruptedException {
            long deadline = System.nanoTime() + wait.toNanos();
            String name = null;
            StringBuilder data = new StringBuilder();
            while (System.nanoTime() < deadline) {
                String line = lines.poll(10, TimeUnit.MILLISECONDS);
                if (line == null) {
                    continue;
                }
                if (END.equals(line)) {
                    break;
                }
                if (line.startsWith("event:")) {
                    name = line.substring("event:".length());
                } else if (line.startsWith("data:")) {
                    data.append(line.substring("data:".length()));
                } else if (line.isEmpty() && name != null) {
                    return new Event(name, data.toString());
                }
            }
            throw new AssertionError("No event came");
        }

        /** The next event whose data has the text; the events before it are passed over. */
        Event nextEventWith(Duration wait, String text) throws InterruptedException {
            long deadline = System.nanoTime() + wait.toNanos();
            while (true) {
                long left = deadline - System.nanoTime();
                if (left <= 0) {
                    throw new AssertionError("No event with " + text);
                }
                Event event = nextEvent(Duration.ofNanos(left));
                if (event.data().contains(text)) {
                    return event;
                }
            }
        }

        /** The events read until one of each name came. */
        List<Event> eventsUntil(Duration wait, String... names) throws InterruptedException {
            List<Event> seen = new ArrayList<>();
            Set<String> missing = new java.util.HashSet<>(List.of(names));
            long deadline = System.nanoTime() + wait.toNanos();
            while (!missing.isEmpty()) {
                long left = deadline - System.nanoTime();
                if (left <= 0) {
                    throw new AssertionError("Never came: " + missing);
                }
                Event event = nextEvent(Duration.ofNanos(left));
                seen.add(event);
                missing.remove(event.name());
            }
            return seen;
        }

        boolean ended(Duration wait) throws InterruptedException {
            long deadline = System.nanoTime() + wait.toNanos();
            while (System.nanoTime() < deadline) {
                String line = lines.poll(10, TimeUnit.MILLISECONDS);
                if (END.equals(line)) {
                    return true;
                }
            }
            return false;
        }

        @Override
        public void close() {
            reader.interrupt();
            response.body().close();
            client.close();
        }

    }

    /** The connector of these tests, whose answers each test may change. */
    static final class SwitchableProvider implements MessageProvider {

        private volatile MessageProvider delegate = twoPages().build();

        void use(MessageProvider provider) {
            delegate = provider;
        }

        @Override
        public ProviderType type() {
            return FAKE;
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
            return delegate.getAccountProfile(context);
        }

        @Override
        public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
            return delegate.fetchUpdates(context, cursor);
        }

    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Connectors {

        @Bean
        SwitchableProvider realtimeConnector() {
            return new SwitchableProvider();
        }

    }

}
