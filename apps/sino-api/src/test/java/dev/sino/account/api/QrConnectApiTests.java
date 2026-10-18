package dev.sino.account.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.FakeQrLogin;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.QrLoginState;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Connecting by QR code (D-275) on the whole application: a fake connector with a QR login, one turned off, and Gmail
 * on (a fake Google client) for a provider that connects over OAuth2. The fake login stands for sino-zalo.
 */
@SpringBootTest(properties = { "sino.google.client-id=1234567890-test.apps.googleusercontent.test",
        "sino.google.client-secret=GOCSPX-test-client-secret-value" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, QrConnectApiTests.QrProviders.class })
@ActiveProfiles("test")
class QrConnectApiTests {

    private static final FakeQrLogin QR = new FakeQrLogin();
    private static final String QR_PROVIDER = "fake-qr";
    private static final String NICK = "100000000000000001";
    private static final String OTHER_NICK = "100000000000000002";
    private static final String COOKIE = "zpw-qr-test-cookie";
    private static final String SESSION = "{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"" + COOKIE + "\"}], "
            + "\"imei\": \"imei-qr-test\", \"userAgent\": \"Mozilla/5.0 (Sino test)\"}";
    private static final String ACCEPT = "{\"acceptRisk\": true}";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;
    private UUID otherOwner;

    @BeforeEach
    void startFromNoAccounts() {
        QR.reset();
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    @AfterEach
    void removeTheOtherOwner() {
        if (otherOwner != null) {
            jdbc.update("delete from connected_account where user_id = ?", otherOwner);
            jdbc.update("delete from app_user where id = ?", otherOwner);
        }
    }

    @Test
    void startsAQrConnection() throws Exception {
        start(new MockHttpSession(), ACCEPT)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.loginId").isString())
                .andExpect(jsonPath("$.qrImage").value(FakeQrLogin.QR_IMAGE))
                .andExpect(jsonPath("$.expiresAt").isString());

        assertThat(QR.starts()).isEqualTo(1);
    }

    // The user must have read the warning about an unofficial way in (D-272) before any QR code is made.
    @ParameterizedTest
    @ValueSource(strings = { "{}", "{\"acceptRisk\": false}", "{\"acceptRisk\": null}" })
    void refusesWithoutTheRiskAccepted(String body) throws Exception {
        start(new MockHttpSession(), body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(QR.starts()).isZero();
    }

    @Test
    void refusesWithoutABody() throws Exception {
        mvc.perform(post("/api/accounts/connect/{provider}/qr", QR_PROVIDER).with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isBadRequest());

        assertThat(QR.starts()).isZero();
    }

    @Test
    void aProviderConnectedOverOAuth2IsNotConnectedByQrCode() throws Exception {
        start("gmail", new MockHttpSession(), ACCEPT)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("CONNECT_METHOD_MISMATCH"));
    }

    @Test
    void aProviderTurnedOffCannotBeConnected() throws Exception {
        start(QrProviders.TURNED_OFF, new MockHttpSession(), ACCEPT)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PROVIDER_DISABLED"));

        assertThat(QrProviders.OFF.starts()).isZero();
    }

    @Test
    void anUnknownProviderIsNotFound() throws Exception {
        start("no-such-provider", new MockHttpSession(), ACCEPT)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("UNKNOWN_PROVIDER"));
    }

    @Test
    void reconnectsOnlyAnAccountOfTheOwner() throws Exception {
        start(new MockHttpSession(), "{\"acceptRisk\": true, \"accountId\": \"" + UUID.randomUUID() + "\"}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));

        assertThat(QR.starts()).isZero();
    }

    @Test
    void needsASignedInUserAndTheCsrfToken() throws Exception {
        mvc.perform(post("/api/accounts/connect/{provider}/qr", QR_PROVIDER).with(csrf()).contentType(APPLICATION_JSON)
                .content(ACCEPT)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/accounts/connect/{provider}/qr", QR_PROVIDER).with(user("owner@sino.test"))
                .contentType(APPLICATION_JSON).content(ACCEPT)).andExpect(status().isForbidden());

        assertThat(QR.starts()).isZero();
    }

    // A browser that is not signed in, or a cancel without the CSRF token; the session that started stays signed in.
    @Test
    void pollingAndCancellingNeedASignedInUserAndCancellingTheCsrfToken() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));

        mvc.perform(get("/api/accounts/connect/{provider}/qr/{loginId}", QR_PROVIDER, loginId)
                .session(new MockHttpSession())).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/accounts/connect/{provider}/qr/{loginId}", QR_PROVIDER, loginId).with(csrf())
                .session(new MockHttpSession())).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/accounts/connect/{provider}/qr/{loginId}", QR_PROVIDER, loginId)
                .with(user("owner@sino.test")).session(session)).andExpect(status().isForbidden());

        assertThat(QR.asked()).isEmpty();
        assertThat(QR.cancelled()).isEmpty();
    }

    @Test
    void tellsWhereTheLoginIs() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));
        QR.answer(loginId, new QrLoginState.Waiting(), new QrLoginState.Scanned("Lan"));

        poll(session, loginId).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("WAITING"))
                .andExpect(jsonPath("$.accountId").doesNotExist());
        poll(session, loginId).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("SCANNED"))
                .andExpect(jsonPath("$.displayName").value("Lan"));
        // Scanned is not over: the user has yet to confirm on the phone.
        poll(session, loginId).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("SCANNED"));
    }

    @Test
    void aConfirmedLoginConnectsANewAccount() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));
        QR.answer(loginId, done(NICK));

        String body = poll(session, loginId).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("DONE"))
                .andExpect(jsonPath("$.reconnected").value(false))
                .andReturn().getResponse().getContentAsString();

        UUID accountId = UUID.fromString(JsonPath.read(body, "$.accountId"));
        assertThat(jdbc.queryForMap("select user_id, provider, external_account_id, status from connected_account "
                + "where id = ?", accountId)).containsEntry("user_id", owner).containsEntry("provider", QR_PROVIDER)
                .containsEntry("external_account_id", NICK).containsEntry("status", "CONNECTED");
        assertThat(jdbc.queryForMap("select credential_type, access_token_enc from account_credential "
                + "where account_id = ?", accountId)).containsEntry("credential_type", "TOKEN")
                .hasEntrySatisfying("access_token_enc", value -> assertThat((String) value).doesNotContain(COOKIE));
        // Done: the session forgot the login, as the connector did.
        poll(session, loginId).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("QR_LOGIN_NOT_FOUND"));
    }

    @Test
    void scanningTheSameNickAgainReconnectsItsAccount() throws Exception {
        UUID accountId = register(owner, NICK);
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", accountId);
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, "{\"acceptRisk\": true, \"accountId\": \"" + accountId + "\"}"));
        QR.answer(loginId, done(NICK));

        poll(session, loginId).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("DONE"))
                .andExpect(jsonPath("$.accountId").value(accountId.toString()))
                .andExpect(jsonPath("$.reconnected").value(true));

        assertThat(statusOf(accountId)).isEqualTo("CONNECTED");
        assertThat(accountsOf(owner)).containsExactly(accountId);
    }

    // "Thêm" with a nick the owner already has: that account comes back, it is not a second one.
    @Test
    void scanningANickTheOwnerHasReconnectsItsAccount() throws Exception {
        UUID accountId = register(owner, NICK);
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));
        QR.answer(loginId, done(NICK));

        poll(session, loginId).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("DONE"))
                .andExpect(jsonPath("$.accountId").value(accountId.toString()))
                .andExpect(jsonPath("$.reconnected").value(true));

        assertThat(accountsOf(owner)).containsExactly(accountId);
    }

    @Test
    void anAccountRemovedWhileItsCodeWasShownIsNotBroughtBack() throws Exception {
        UUID accountId = register(owner, NICK);
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, "{\"acceptRisk\": true, \"accountId\": \"" + accountId + "\"}"));
        jdbc.update("update connected_account set removed_at = now() where id = ?", accountId);
        QR.answer(loginId, done(NICK));

        poll(session, loginId).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("FAILED"))
                .andExpect(jsonPath("$.code").value("CONNECT_FAILED"));

        assertThat(accountsOf(owner)).isEmpty();
    }

    // Two polls of one browser cross: the account is registered once, and the poll that waited finds the login over.
    @Test
    void twoPollsAtOnceRegisterTheAccountOnce() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));
        QR.answer(loginId, done(NICK));
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        QR.holdNextStatus(entered, release);
        ExecutorService polls = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> first = polls.submit(() -> poll(session, loginId).andReturn());
            assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
            Future<MvcResult> second = polls.submit(() -> poll(session, loginId).andReturn());
            // Time for the second poll to reach the session's lock while the first holds it.
            Thread.sleep(500);
            release.countDown();

            assertThat(first.get(10, TimeUnit.SECONDS).getResponse().getContentAsString()).contains("\"DONE\"");
            assertThat(second.get(10, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(404);
        } finally {
            polls.shutdownNow();
        }
        assertThat(accountsOf(owner)).hasSize(1);
    }

    @Test
    void reconnectingWithAnotherNickChangesNothing() throws Exception {
        UUID accountId = register(owner, NICK);
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", accountId);
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, "{\"acceptRisk\": true, \"accountId\": \"" + accountId + "\"}"));
        QR.answer(loginId, done(OTHER_NICK));

        poll(session, loginId).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("FAILED"))
                .andExpect(jsonPath("$.code").value("CONNECT_WRONG_ACCOUNT"))
                .andExpect(jsonPath("$.accountId").doesNotExist());

        assertThat(statusOf(accountId)).isEqualTo("AUTH_EXPIRED");
        assertThat(accountsOf(owner)).containsExactly(accountId);
    }

    // D-290: Zalo keeps one web session per nick, so two owners on one nick would kick each other out without end.
    @ParameterizedTest
    @ValueSource(strings = { "CONNECTED", "DISABLED" })
    void aNickThatAnotherOwnerHasIsNotConnected(String status) throws Exception {
        UUID theirs = register(otherOwner(), NICK);
        jdbc.update("update connected_account set status = ? where id = ?", status, theirs);
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));
        QR.answer(loginId, done(NICK));

        poll(session, loginId).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("FAILED"))
                .andExpect(jsonPath("$.code").value("CONNECT_ACCOUNT_IN_USE"));

        assertThat(accountsOf(owner)).isEmpty();
        assertThat(statusOf(theirs)).isEqualTo(status);
    }

    @Test
    void aNickAnotherOwnerRemovedCanBeConnected() throws Exception {
        UUID theirs = register(otherOwner(), NICK);
        jdbc.update("update connected_account set removed_at = now() where id = ?", theirs);
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));
        QR.answer(loginId, done(NICK));

        poll(session, loginId).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("DONE"));

        assertThat(accountsOf(owner)).hasSize(1);
    }

    @Test
    void aLoginThatEndsWithoutAnAccountIsForgotten() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String expired = loginIdOf(start(session, ACCEPT));
        String declined = loginIdOf(start(session, ACCEPT));
        String failed = loginIdOf(start(session, ACCEPT));
        QR.answer(expired, new QrLoginState.Expired());
        QR.answer(declined, new QrLoginState.Declined());
        QR.answer(failed, new QrLoginState.Failed("the listener closed"));

        poll(session, expired).andExpect(jsonPath("$.state").value("EXPIRED"));
        poll(session, declined).andExpect(jsonPath("$.state").value("DECLINED"));
        poll(session, failed).andExpect(jsonPath("$.state").value("FAILED"))
                .andExpect(jsonPath("$.code").value("CONNECT_FAILED"));

        for (String loginId : List.of(expired, declined, failed)) {
            poll(session, loginId).andExpect(status().isNotFound());
        }
        assertThat(accountsOf(owner)).isEmpty();
    }

    @Test
    void aLoginOfAnotherBrowserIsNotFound() throws Exception {
        String loginId = loginIdOf(start(new MockHttpSession(), ACCEPT));

        poll(new MockHttpSession(), loginId).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("QR_LOGIN_NOT_FOUND"));

        assertThat(QR.asked()).isEmpty();
    }

    @Test
    void aLoginIsFoundOnlyUnderItsOwnProvider() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));

        mvc.perform(get("/api/accounts/connect/{provider}/qr/{loginId}", QrProviders.TURNED_OFF, loginId)
                .with(user("owner@sino.test")).session(session)).andExpect(status().isNotFound());

        assertThat(QR.asked()).isEmpty();
        assertThat(QrProviders.OFF.asked()).isEmpty();
    }

    // A provider slow for one poll does not end the login: the next poll asks again.
    @Test
    void aPollTheProviderDidNotAnswerKeepsTheLogin() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));
        QR.failNextStatus(new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "sino-zalo did not answer"));

        poll(session, loginId).andExpect(status().isBadGateway()).andExpect(jsonPath("$.code").value("QR_UNAVAILABLE"));
        poll(session, loginId).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("WAITING"));
    }

    @Test
    void noQrCodeFromTheProviderIsAProviderFailure() throws Exception {
        QR.failStarts(new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "Zalo gave no QR code"));

        start(new MockHttpSession(), ACCEPT).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("QR_UNAVAILABLE"));
    }

    @Test
    void closingTheDialogCancelsTheLogin() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String loginId = loginIdOf(start(session, ACCEPT));

        mvc.perform(delete("/api/accounts/connect/{provider}/qr/{loginId}", QR_PROVIDER, loginId)
                .with(user("owner@sino.test")).with(csrf()).session(session)).andExpect(status().isNoContent());

        assertThat(QR.cancelled()).containsExactly(loginId);
        poll(session, loginId).andExpect(status().isNotFound());
    }

    // Nothing to cancel, or a login of another browser: 204 all the same, and the provider hears nothing.
    @Test
    void cancellingALoginTheSessionDoesNotHaveDoesNothing() throws Exception {
        String loginId = loginIdOf(start(new MockHttpSession(), ACCEPT));

        mvc.perform(delete("/api/accounts/connect/{provider}/qr/{loginId}", QR_PROVIDER, loginId)
                .with(user("owner@sino.test")).with(csrf()).session(new MockHttpSession()))
                .andExpect(status().isNoContent());

        assertThat(QR.cancelled()).isEmpty();
    }

    private ResultActions start(MockHttpSession session, String body) throws Exception {
        return start(QR_PROVIDER, session, body);
    }

    private ResultActions start(String provider, MockHttpSession session, String body) throws Exception {
        return mvc.perform(post("/api/accounts/connect/{provider}/qr", provider).with(user("owner@sino.test"))
                .with(csrf()).session(session).contentType(APPLICATION_JSON).content(body));
    }

    private ResultActions poll(MockHttpSession session, String loginId) throws Exception {
        return mvc.perform(get("/api/accounts/connect/{provider}/qr/{loginId}", QR_PROVIDER, loginId)
                .with(user("owner@sino.test")).session(session));
    }

    private static String loginIdOf(ResultActions started) throws Exception {
        return JsonPath.read(started.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
                "$.loginId");
    }

    private static QrLoginState.Done done(String nick) {
        return new QrLoginState.Done(new AccountProfile(nick, "Lan", null, null), new TokenCredentials(SESSION));
    }

    private UUID register(UUID ownerId, String nick) {
        return registration.register(new RegisterAccountCommand(ownerId, ProviderType.of(QR_PROVIDER),
                new AccountProfile(nick, "Lan", null, null), new TokenCredentials(SESSION), null));
    }

    private UUID otherOwner() {
        otherOwner = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, 'other-owner@sino.test', 'Other', 'ACTIVE', now(), now())", otherOwner);
        return otherOwner;
    }

    private String statusOf(UUID accountId) {
        return jdbc.queryForObject("select status from connected_account where id = ?", String.class, accountId);
    }

    private List<UUID> accountsOf(UUID ownerId) {
        return jdbc.queryForList("select id from connected_account where user_id = ? and removed_at is null",
                UUID.class, ownerId);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class QrProviders {

        static final String TURNED_OFF = "fake-qr-off";
        static final FakeQrLogin OFF = new FakeQrLogin();

        @Bean
        FakeMessageProvider qrProvider() {
            return FakeMessageProvider.builder(QR_PROVIDER).qrLogin(QR).build();
        }

        @Bean
        FakeMessageProvider turnedOffQrProvider() {
            return FakeMessageProvider.builder(TURNED_OFF).qrLogin(OFF).turnedOff().build();
        }

    }

}
