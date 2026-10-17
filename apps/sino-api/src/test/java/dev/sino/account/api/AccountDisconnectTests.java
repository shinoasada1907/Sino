package dev.sino.account.api;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.delete;
import static com.github.tomakehurst.wiremock.client.WireMock.deleteRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.noContent;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.AccountRemoved;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountStatusChanged;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Removing or disabling an account calls {@code MessageProvider.disconnect(context)} after the database transaction
 * has committed, outside any transaction, and best-effort so a provider failure only logs a warning without undoing
 * the change (F09, ZL-10, D-284).
 */
@SpringBootTest(properties = {
        "sino.zalo.enabled=true",
        "sino.zalo.secret=" + AccountDisconnectTests.SECRET
})
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, AccountDisconnectTests.RollbackTrigger.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class AccountDisconnectTests {

    static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String COOKIE_SECRET = "zpw-account-disconnect-cookie";
    private static final String SESSION_JSON = "{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"" + COOKIE_SECRET
            + "\"}], \"imei\": \"imei-1\", \"userAgent\": \"Mozilla/5.0\"}";

    private static final WireMockServer sinoZalo = new WireMockServer(options().dynamicPort());
    private static final AtomicReference<Map<String, Object>> seenBySinoZalo = new AtomicReference<>();
    private static volatile JdbcTemplate database;
    private static volatile UUID watchedAccount;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;

    @DynamicPropertySource
    static void sinoZaloIsWireMock(DynamicPropertyRegistry registry) {
        if (!sinoZalo.isRunning()) {
            sinoZalo.start();
            // Runs while sino-zalo is handling DELETE /session, proving the DB transaction already committed.
            sinoZalo.addMockServiceRequestListener((request, response) -> {
                if (request.getUrl().endsWith("/session") && watchedAccount != null) {
                    seenBySinoZalo.set(database.queryForMap("select "
                            + "(select status from connected_account where id = ?) as status, "
                            + "(select removed_at is not null from connected_account where id = ?) as removed, "
                            + "(select count(*) from account_credential where account_id = ?) as credentials",
                            watchedAccount, watchedAccount, watchedAccount));
                }
            });
        }
        registry.add("sino.zalo.url", sinoZalo::baseUrl);
    }

    @AfterAll
    static void stopSinoZalo() {
        sinoZalo.stop();
    }

    @BeforeEach
    void startFromNoAccounts() {
        sinoZalo.resetAll();
        database = jdbc;
        watchedAccount = null;
        seenBySinoZalo.set(null);
        RollbackTrigger.failRemovalOf = null;
        RollbackTrigger.failStatusChangeOf = null;
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    @Test
    void removingAZaloAccountDeletesItsSessionOnceTheRemovalIsCommitted() throws Exception {
        UUID zalo = zaloAccount();
        watchedAccount = zalo;
        String sessionPath = "/accounts/" + zalo + "/session";
        sinoZalo.stubFor(delete(urlPathEqualTo(sessionPath)).willReturn(noContent()));

        remove(zalo).andExpect(status().isNoContent());

        sinoZalo.verify(deleteRequestedFor(urlPathEqualTo(sessionPath))
                .withHeader("Authorization", equalTo("Bearer " + SECRET)));
        assertThat(seenBySinoZalo.get()).as("the database while sino-zalo handled DELETE /session")
                .containsEntry("removed", true)
                .containsEntry("credentials", 0L);
    }

    @Test
    void disablingAZaloAccountDeletesItsSessionOnceTheChangeIsCommitted() throws Exception {
        UUID zalo = zaloAccount();
        watchedAccount = zalo;
        String sessionPath = "/accounts/" + zalo + "/session";
        sinoZalo.stubFor(delete(urlPathEqualTo(sessionPath)).willReturn(noContent()));

        patchAccount(zalo, "{\"enabled\": false}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DISABLED"));

        sinoZalo.verify(deleteRequestedFor(urlPathEqualTo(sessionPath))
                .withHeader("Authorization", equalTo("Bearer " + SECRET)));
        assertThat(seenBySinoZalo.get()).as("the database while sino-zalo handled DELETE /session")
                .containsEntry("status", "DISABLED")
                .containsEntry("removed", false)
                .containsEntry("credentials", 1L);
    }

    @Test
    void disablingAnAlreadyDisabledAccountOrRenamingOrEnablingDoesNotDisconnect() throws Exception {
        UUID zalo = zaloAccount();
        String sessionPath = "/accounts/" + zalo + "/session";
        sinoZalo.stubFor(delete(urlPathEqualTo(sessionPath)).willReturn(noContent()));

        patchAccount(zalo, "{\"enabled\": false}").andExpect(status().isOk());
        sinoZalo.resetRequests();

        patchAccount(zalo, "{\"enabled\": false}").andExpect(status().isOk());
        patchAccount(zalo, "{\"displayName\": \"Zalo Mới\"}").andExpect(status().isOk());
        patchAccount(zalo, "{\"enabled\": true}").andExpect(status().isOk());

        sinoZalo.verify(0, anyRequestedFor(anyUrl()));
    }

    @Test
    void aRemovalThatRollsBackNeverDisconnects() throws Exception {
        UUID zalo = zaloAccount();
        RollbackTrigger.failRemovalOf = zalo;

        remove(zalo).andExpect(status().isInternalServerError());

        sinoZalo.verify(0, anyRequestedFor(anyUrl()));
        mvc.perform(get("/api/accounts/" + zalo).with(user("owner@sino.test"))).andExpect(status().isOk());
    }

    @Test
    void aDisableThatRollsBackNeverDisconnects() throws Exception {
        UUID zalo = zaloAccount();
        RollbackTrigger.failStatusChangeOf = zalo;

        patchAccount(zalo, "{\"enabled\": false}").andExpect(status().isInternalServerError());

        sinoZalo.verify(0, anyRequestedFor(anyUrl()));
        mvc.perform(get("/api/accounts/" + zalo).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONNECTED"));
    }

    @Test
    void whenSinoZaloFailsDuringRemoveTheAccountIsStillRemovedAndOnlyAWarningIsLogged(CapturedOutput output)
            throws Exception {
        UUID zalo = zaloAccount();
        String sessionPath = "/accounts/" + zalo + "/session";
        sinoZalo.stubFor(delete(urlPathEqualTo(sessionPath)).willReturn(aResponse().withStatus(500)
                .withBody("boom " + SECRET + " " + COOKIE_SECRET)));

        remove(zalo).andExpect(status().isNoContent());

        mvc.perform(get("/api/accounts/" + zalo).with(user("owner@sino.test"))).andExpect(status().isNotFound());
        assertThat(output).contains("WARN").contains(zalo.toString()).contains("PROVIDER_UNAVAILABLE")
                .doesNotContain(SECRET).doesNotContain(COOKIE_SECRET);
    }

    @Test
    void whenSinoZaloFailsDuringDisableTheAccountIsStillDisabledAndOnlyAWarningIsLogged(CapturedOutput output)
            throws Exception {
        UUID zalo = zaloAccount();
        String sessionPath = "/accounts/" + zalo + "/session";
        sinoZalo.stubFor(delete(urlPathEqualTo(sessionPath)).willReturn(aResponse().withStatus(500)
                .withBody("boom " + SECRET + " " + COOKIE_SECRET)));

        patchAccount(zalo, "{\"enabled\": false}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DISABLED"));

        assertThat(output).contains("WARN").contains(zalo.toString()).contains("PROVIDER_UNAVAILABLE")
                .doesNotContain(SECRET).doesNotContain(COOKIE_SECRET);
    }

    private UUID zaloAccount() {
        return registration.register(new RegisterAccountCommand(owner, ProviderType.of("zalo"),
                new AccountProfile("100000000000000001", "Nguyễn Văn A", null, null),
                new TokenCredentials(SESSION_JSON), null));
    }

    private ResultActions remove(UUID accountId) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.delete("/api/accounts/" + accountId)
                .with(user("owner@sino.test")).with(csrf()));
    }

    private ResultActions patchAccount(UUID accountId, String body) throws Exception {
        return mvc.perform(patch("/api/accounts/" + accountId)
                .with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content(body));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class RollbackTrigger {

        static volatile UUID failRemovalOf;
        static volatile UUID failStatusChangeOf;

        @EventListener
        void failRemoval(AccountRemoved removed) {
            if (removed.accountId().equals(failRemovalOf)) {
                throw new IllegalStateException("simulated failure inside the removal transaction");
            }
        }

        @EventListener
        void failStatusChange(AccountStatusChanged changed) {
            if (changed.accountId().equals(failStatusChangeOf) && changed.to() == AccountStatus.DISABLED) {
                throw new IllegalStateException("simulated failure inside the disable transaction");
            }
        }

    }

}
