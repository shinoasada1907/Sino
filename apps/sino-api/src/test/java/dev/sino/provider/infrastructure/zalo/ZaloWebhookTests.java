package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.ResultMatcher;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderPushReceived;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.TokenCredentials;

/**
 * The webhook where sino-zalo wakes Sino on a new message (D-277, ZL-08): {@code POST /api/webhooks/zalo} with the
 * shared secret in {@code Authorization: Bearer <SINO_ZALO_SECRET>}, reading at most 1 KB, and handing {@code ownId}
 * on as {@link ProviderPushReceived} so {@code PushNotices} triggers an immediate sync.
 */
@SpringBootTest(properties = {
    "sino.zalo.enabled=true",
    "sino.zalo.secret=" + ZaloWebhookTests.SECRET
})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@RecordApplicationEvents
@ExtendWith(OutputCaptureExtension.class)
class ZaloWebhookTests {

    static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String OWN_ID = "100000000000000001";
    private static final String SESSION_JSON = """
            {"cookie": [{"key": "zpw_sek", "value": "zpw-webhook-test"}], "imei": "imei-webhook", "userAgent": "UA"}
            """;
    private static final WireMockServer SINO_ZALO = new WireMockServer(options().dynamicPort());

    static {
        SINO_ZALO.start();
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ApplicationEvents events;

    @Autowired
    private ZaloWebhookController controller;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AppUserRepository users;

    @DynamicPropertySource
    static void fakeSinoZalo(DynamicPropertyRegistry registry) {
        registry.add("sino.zalo.url", SINO_ZALO::baseUrl);
    }

    @AfterAll
    static void stopSinoZalo() {
        SINO_ZALO.stop();
    }

    @BeforeEach
    void resetSinoZalo() {
        SINO_ZALO.resetAll();
    }

    @Test
    void aNoticeWithTheSharedSecretPublishesProviderPushReceivedForOwnId(CapturedOutput output) throws Exception {
        int publications = publications();
        UUID accountId = UUID.randomUUID();

        push(SECRET, """
                {"accountId": "%s", "ownId": "%s"}
                """.formatted(accountId, OWN_ID))
                .andExpect(status().isNoContent())
                .andExpect(noSessionNorCookie());

        assertThat(events.stream(ProviderPushReceived.class)).singleElement().satisfies(received -> {
            assertThat(received.provider()).isEqualTo(ZaloProvider.TYPE);
            assertThat(received.address()).isEqualTo(OWN_ID);
        });
        assertThat(publications()).as("nothing kept in Modulith's registry").isEqualTo(publications);
        assertThat(output.getAll()).doesNotContain(SECRET);
    }

    @Test
    void aNoticeSyncsTheZaloAccountWatchedUnderItsOwnId() throws Exception {
        UUID owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        UUID account = registration.register(new RegisterAccountCommand(owner, ZaloProvider.TYPE,
                new AccountProfile(OWN_ID, "Nguyễn Văn A", null, null),
                new TokenCredentials(SESSION_JSON), null));
        jdbc.update("insert into sync_checkpoint (account_id, cursor, import_status, import_range, imported_count,"
                + " skipped_count, run_imported_count, last_started_at, last_success_at, watch_address,"
                + " watch_expires_at, updated_at) values (?, '1000', 'DONE', 'ALL', 0, 0, 0, now(),"
                + " now(), ?, now() + interval '3 days', now())", account, OWN_ID);
        SINO_ZALO.stubFor(get(urlPathEqualTo("/accounts/" + account + "/messages")).willReturn(okJson("""
                {
                  "conversations": [
                    {"threadId": "200000000000000002", "threadType": "USER", "title": "Trần Bình",
                     "avatarUrl": null, "participants": [{"id": "200000000000000002", "name": "Trần Bình"}]}
                  ],
                  "messages": [
                    {"msgId": "1001", "threadId": "200000000000000002", "threadType": "USER",
                     "fromId": "200000000000000002", "fromName": "Trần Bình", "isSelf": false,
                     "zaloType": "webchat", "text": "Tin mới qua webhook", "sentAt": "2026-10-17T09:00:00Z"}
                  ],
                  "nextCursor": "1001",
                  "hasMore": false
                }
                """)));

        push(SECRET, """
                {"accountId": "%s", "ownId": "%s"}
                """.formatted(account, OWN_ID)).andExpect(status().isNoContent());

        Map<String, Object> row = awaitSynced(account);
        assertThat(row.get("last_sync_error")).isNull();
        assertThat(row.get("cursor")).isEqualTo("1001");
        SINO_ZALO.verify(getRequestedFor(urlPathEqualTo("/accounts/" + account + "/messages"))
                .withQueryParam("after", equalTo("1000"))
                .withHeader("Authorization", equalTo("Bearer " + SECRET)));
    }

    @Test
    void aNoticeWithoutAuthorizationIsRefused401AndPublishesNothing() throws Exception {
        mvc.perform(post("/api/webhooks/zalo").contentType(APPLICATION_JSON)
                .content("{\"ownId\": \"" + OWN_ID + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PUSH_TOKEN_INVALID"))
                .andExpect(noSessionNorCookie());

        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "wrong-secret", "Basic dXNlcjpwYXNz", "Bearer ", "Bearer wrong-secret-0123456789abcdef" })
    void aNoticeWithWrongSecretIsRefused401AndPublishesNothing(String header) throws Exception {
        mvc.perform(post("/api/webhooks/zalo").header("Authorization", header).contentType(APPLICATION_JSON)
                .content("{\"ownId\": \"" + OWN_ID + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PUSH_TOKEN_INVALID"))
                .andExpect(noSessionNorCookie());

        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
    }

    @Test
    void aBodyLargerThan1KilobyteIsRejectedWithoutPublishing() throws Exception {
        String start = "{\"ownId\": \"" + OWN_ID + "\", \"pad\": \"";
        String oversized = start + "x".repeat(ZaloWebhookController.MAX_BODY_BYTES + 1 - start.length() - 2) + "\"}";
        assertThat(oversized).hasSize(ZaloWebhookController.MAX_BODY_BYTES + 1);

        push(SECRET, oversized).andExpect(status().isBadRequest());

        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "not json", "{}", "{\"ownId\": \"\"}", "{\"ownId\": \"   \"}" })
    void anUnusableBodyIsRejectedWithoutPublishing(String body, CapturedOutput output) throws Exception {
        push(SECRET, body).andExpect(status().isBadRequest());

        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
        assertThat(output.getAll()).doesNotContain("not json");
    }

    @Test
    void aNoticeThatBreaksOffWhileBeingReadReturns400() {
        InputStream brokenOff = new InputStream() {
            @Override
            public int read() throws IOException {
                throw new IOException("connection reset by " + OWN_ID);
            }
        };

        ResponseEntity<Void> answer = controller.receive("Bearer " + SECRET, brokenOff);

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
    }

    private ResultActions push(String token, String body) throws Exception {
        return mvc.perform(post("/api/webhooks/zalo").header("Authorization", "Bearer " + token)
                .contentType(APPLICATION_JSON).content(body));
    }

    private static ResultMatcher noSessionNorCookie() {
        return result -> {
            assertThat(result.getRequest().getSession(false)).as("no session").isNull();
            header().doesNotExist("Set-Cookie").match(result);
        };
    }

    private int publications() {
        return jdbc.queryForObject("select count(*) from event_publication", Integer.class);
    }

    private Map<String, Object> awaitSynced(UUID account) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (System.nanoTime() < deadline) {
            Map<String, Object> row = jdbc.queryForMap("select * from sync_checkpoint where account_id = ?", account);
            if (row.get("last_sync_at") != null || row.get("last_sync_error") != null) {
                return row;
            }
            Thread.sleep(25);
        }
        throw new AssertionError("The account " + account + " was never synced");
    }

}
