package dev.sino.provider.infrastructure.gmail;

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
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
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
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderPushReceived;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.OAuth2Credentials;

/**
 * The webhook of Gmail's notices (BE-52, D-76) through the whole application: no session, no cookie, no CSRF token,
 * the token checked before anything else, and a readable notice handed on as {@link ProviderPushReceived}, down to
 * the sync of the Gmail account watched under its address. The checks of the token itself are
 * {@link GmailPushTokensTests}; Google's keys and Gmail's API come from a fake Google (WireMock).
 */
@SpringBootTest(properties = { "sino.google.client-id=1234567890-test.apps.googleusercontent.test",
    "sino.google.client-secret=GOCSPX-test-client-secret-value",
    "sino.google.pubsub.topic=projects/sino-test/topics/gmail",
    "sino.google.pubsub.audience=" + GmailWebhookTests.AUDIENCE,
    "sino.google.pubsub.service-account=" + GmailWebhookTests.SERVICE_ACCOUNT })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@RecordApplicationEvents
@ExtendWith(OutputCaptureExtension.class)
class GmailWebhookTests {

    static final String AUDIENCE = "https://sino.test/api/webhooks/gmail";
    static final String SERVICE_ACCOUNT = "gmail-push@sino-test.iam.gserviceaccount.com";
    private static final String MAILBOX = "Owner.Name@gmail.test";
    private static final String GMAIL_ACCESS_TOKEN = "ya29.gmail-webhook-access-token";
    private static final WireMockServer GOOGLE = new WireMockServer(options().dynamicPort());
    private static final RSAKey GOOGLE_KEY;

    static {
        try {
            GOOGLE_KEY = new RSAKeyGenerator(2048).keyID("google-key-1").generate();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
        GOOGLE.start();
        GOOGLE.stubFor(get(urlPathEqualTo("/certs")).willReturn(okJson(new JWKSet(GOOGLE_KEY).toString())));
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ApplicationEvents events;

    @Autowired
    private GmailPushController controller;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AppUserRepository users;

    @DynamicPropertySource
    static void fakeGoogle(DynamicPropertyRegistry registry) {
        registry.add("sino.google.pubsub.jwk-set-uri", () -> GOOGLE.baseUrl() + "/certs");
        registry.add("sino.google.gmail-api-uri", GOOGLE::baseUrl);
    }

    @AfterAll
    static void stopGoogle() {
        GOOGLE.stop();
    }

    @Test
    void aNoticeFromGoogleIsHandedOnWithItsAddressOnly(CapturedOutput output) throws Exception {
        int publications = publications();

        push(validToken(), notice("""
                {"emailAddress": "%s", "historyId": "9876543210"}
                """.formatted(MAILBOX))).andExpect(status().isNoContent()).andExpect(noSessionNorCookie());

        assertThat(events.stream(ProviderPushReceived.class)).singleElement().satisfies(received -> {
            assertThat(received.provider()).isEqualTo(GmailProvider.TYPE);
            assertThat(received.address()).isEqualTo(MAILBOX);
        });
        assertThat(publications()).as("nothing kept in Modulith's registry").isEqualTo(publications);
        assertThat(output.getAll()).doesNotContain(MAILBOX).doesNotContain("9876543210");
    }

    // The whole way: Google's notice, the account watched under its address, its sync through Gmail's API.
    @Test
    void aNoticeSyncsTheGmailAccountWatchedUnderItsAddress() throws Exception {
        UUID owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        UUID account = registration.register(new RegisterAccountCommand(owner, GmailProvider.TYPE,
                new AccountProfile("110248495921238986420", MAILBOX, null, MAILBOX),
                new OAuth2Credentials(GMAIL_ACCESS_TOKEN, Instant.now().plus(1, ChronoUnit.HOURS),
                        GmailProvider.SCOPES), "test-refresh-token"));
        jdbc.update("insert into sync_checkpoint (account_id, cursor, import_status, import_range, imported_count,"
                + " skipped_count, run_imported_count, last_started_at, last_success_at, watch_address,"
                + " watch_expires_at, updated_at) values (?, 'v1|history|1000|-', 'DONE', 'ALL', 0, 0, 0, now(),"
                + " now(), ?, now() + interval '6 days', now())", account, MAILBOX.toLowerCase());
        GOOGLE.stubFor(get(urlPathEqualTo("/gmail/v1/users/me/profile")).willReturn(okJson("""
                {"emailAddress": "%s", "historyId": "1001"}
                """.formatted(MAILBOX))));
        GOOGLE.stubFor(get(urlPathEqualTo("/gmail/v1/users/me/history")).willReturn(okJson("{\"historyId\": \"1001\"}")));

        push(validToken(), notice("""
                {"emailAddress": "%s", "historyId": "1001"}
                """.formatted(MAILBOX))).andExpect(status().isNoContent());

        Map<String, Object> row = awaitSynced(account);
        assertThat(row.get("last_sync_error")).isNull();
        assertThat(row.get("cursor")).isEqualTo("v1|history|1001|-");
        GOOGLE.verify(getRequestedFor(urlPathEqualTo("/gmail/v1/users/me/history"))
                .withQueryParam("startHistoryId", equalTo("1000"))
                .withHeader("Authorization", equalTo("Bearer " + GMAIL_ACCESS_TOKEN)));
    }

    @Test
    void aPushWithoutTokenIsRefusedAndDoesNothing() throws Exception {
        mvc.perform(post("/api/webhooks/gmail").contentType(APPLICATION_JSON).content(notice("""
                {"emailAddress": "%s", "historyId": "1"}
                """.formatted(MAILBOX))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PUSH_TOKEN_INVALID"))
                .andExpect(noSessionNorCookie());

        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
    }

    @Test
    void aPushWithATokenForAnotherAudienceIsRefusedAndDoesNothing() throws Exception {
        String elsewhere = GmailPushTokensTests.token(GOOGLE_KEY, claims -> claims.audience("https://elsewhere.test")
                .claim("email", SERVICE_ACCOUNT));

        push(elsewhere, notice("{\"emailAddress\": \"%s\"}".formatted(MAILBOX)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PUSH_TOKEN_INVALID"));

        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
    }

    // Pub/Sub would send it again for days: it is taken, and dropped.
    @ParameterizedTest
    @ValueSource(strings = { "not json", "{}", "{\"message\": {}}", "{\"message\": {\"data\": \"%%%\"}}",
        "{\"message\": {\"data\": \"bm90IGpzb24=\"}}", "{\"message\": {\"data\": \"e30=\"}}",
        "{\"message\": {\"data\": \"eyJlbWFpbEFkZHJlc3MiOiAiICJ9\"}}", "{\"message\": {\"data\": 42}}" })
    void aNoticeThatCannotBeReadIsTakenAndDropped(String body, CapturedOutput output) throws Exception {
        push(validToken(), body).andExpect(status().isNoContent());

        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
        assertThat(output.getAll()).contains("A Gmail notice with a valid token could not be read")
                .doesNotContain("not json");
    }

    // One byte too long, yet whole: it is not read, not even in part.
    @Test
    void aNoticeTooLongToReadIsTakenAndDropped() throws Exception {
        String start = "{\"message\": {\"data\": \"%s\"}, \"padding\": \"".formatted(base64("""
                {"emailAddress": "%s"}
                """.formatted(MAILBOX)));
        String body = start + "x".repeat(GmailPushController.MAX_BODY_BYTES + 1 - start.length() - 2) + "\"}";
        assertThat(body).hasSize(GmailPushController.MAX_BODY_BYTES + 1);

        push(validToken(), body).andExpect(status().isNoContent());

        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
    }

    // An address whose standard base64 has '+' or '/', which the URL-safe alphabet writes '-' and '_'.
    @Test
    void aNoticeWithURLSafeBase64IsReadToo() throws Exception {
        byte[] notice = "{\"emailAddress\": \"owner???@gmail.test\"}".getBytes(StandardCharsets.UTF_8);
        String data = Base64.getUrlEncoder().encodeToString(notice);
        assertThat(data).as("differs from standard base64").isNotEqualTo(Base64.getEncoder().encodeToString(notice));

        push(validToken(), "{\"message\": {\"data\": \"%s\"}}".formatted(data)).andExpect(status().isNoContent());

        assertThat(events.stream(ProviderPushReceived.class)).singleElement()
                .satisfies(received -> assertThat(received.address()).isEqualTo("owner???@gmail.test"));
    }

    // Called directly: a request whose body breaks off cannot be made through MockMvc.
    @Test
    void aNoticeThatBreaksOffWhileBeingReadIsAskedAgain(CapturedOutput output) throws Exception {
        InputStream brokenOff = new InputStream() {

            @Override
            public int read() throws IOException {
                throw new IOException("connection reset by " + MAILBOX);
            }

        };

        ResponseEntity<Void> answer = controller.receive("Bearer " + validToken(), brokenOff);

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(events.stream(ProviderPushReceived.class)).isEmpty();
        assertThat(output.getAll()).contains("A Gmail notice broke off while being read").doesNotContain(MAILBOX);
    }

    private ResultActions push(String token, String body) throws Exception {
        return mvc.perform(post("/api/webhooks/gmail").header("Authorization", "Bearer " + token)
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

    private static String validToken() throws JOSEException {
        return GmailPushTokensTests.token(GOOGLE_KEY, claims -> claims.audience(AUDIENCE)
                .claim("email", SERVICE_ACCOUNT));
    }

    /** A push as Pub/Sub sends it, with Gmail's notice as its data. */
    private static String notice(String gmailNotice) {
        return """
                {"message": {"data": "%s", "messageId": "2070443601311540", "publishTime": "2026-10-10T08:00:00Z"},
                 "subscription": "projects/sino-test/subscriptions/gmail-push"}
                """.formatted(base64(gmailNotice));
    }

    private static String base64(String text) {
        return Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

}
