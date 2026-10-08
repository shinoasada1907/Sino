package dev.sino.account.api;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.ok;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.Set;
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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.AccountRemoved;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.TokenCredentials;

/**
 * Removing an account also asks the provider to drop Sino's grant (F04a): once the removal is committed, outside
 * its transaction, and never at the cost of the removal itself. WireMock stands in for Google's revoke endpoint.
 */
@SpringBootTest(properties = { "sino.google.client-id=1234567890-test.apps.googleusercontent.test",
        "sino.google.client-secret=GOCSPX-test-client-secret-value" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, RemoveAccountRevokesTests.Extras.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class RemoveAccountRevokesTests {

    private static final String GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
    private static final String ACCESS = "ya29.remove-test-access-token";
    private static final String REFRESH = "1//remove-test-refresh-token";

    private static final WireMockServer google = new WireMockServer(options().dynamicPort());
    // What another database connection saw while Google was handling the revocation.
    private static final AtomicReference<Map<String, Object>> seenByGoogle = new AtomicReference<>();
    private static volatile JdbcTemplate database;
    private static volatile UUID removing;

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
    static void googleIsWireMock(DynamicPropertyRegistry registry) {
        if (!google.isRunning()) {
            google.start();
            // Called before WireMock answers, so Sino is still waiting for the revocation at this point.
            google.addMockServiceRequestListener((request, response) -> {
                if (request.getUrl().startsWith("/revoke") && removing != null) {
                    seenByGoogle.set(database.queryForMap("select "
                            + "(select removed_at is not null from connected_account where id = ?) as removed, "
                            + "(select count(*) from account_credential where account_id = ?) as credentials",
                            removing, removing));
                }
            });
        }
        registry.add("sino.google.revocation-uri", () -> google.baseUrl() + "/revoke");
    }

    @AfterAll
    static void stopGoogle() {
        google.stop();
    }

    @BeforeEach
    void startFromNoAccounts() {
        google.resetAll();
        google.stubFor(post(urlPathEqualTo("/revoke")).willReturn(ok()));
        database = jdbc;
        removing = null;
        seenByGoogle.set(null);
        Extras.failTheRemovalOf = null;
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    @Test
    void removingAGmailAccountRevokesItsRefreshTokenOnceTheRemovalIsCommitted() throws Exception {
        UUID gmail = gmailAccount();
        removing = gmail;

        remove(gmail).andExpect(status().isNoContent());

        google.verify(postRequestedFor(urlPathEqualTo("/revoke")).withFormParam("token", equalTo(REFRESH)));
        assertThat(seenByGoogle.get()).as("the database while Google handled the revocation")
                .containsEntry("removed", true).containsEntry("credentials", 0L);
    }

    @Test
    void aFailingRevocationStillRemovesTheAccountAndOnlyWarns(CapturedOutput output) throws Exception {
        UUID gmail = gmailAccount();
        google.stubFor(post(urlPathEqualTo("/revoke")).willReturn(aResponse().withStatus(500)
                .withBody("oops " + REFRESH)));

        remove(gmail).andExpect(status().isNoContent());

        mvc.perform(get("/api/accounts/" + gmail).with(user("owner@sino.test"))).andExpect(status().isNotFound());
        assertThat(output).contains("WARN").contains(gmail.toString()).contains("500")
                .doesNotContain(REFRESH).doesNotContain(ACCESS);
    }

    @Test
    void aRemovalThatRollsBackRevokesNothing() throws Exception {
        UUID gmail = gmailAccount();
        Extras.failTheRemovalOf = gmail;

        remove(gmail).andExpect(status().isInternalServerError());

        google.verify(0, postRequestedFor(urlPathEqualTo("/revoke")));
        mvc.perform(get("/api/accounts/" + gmail).with(user("owner@sino.test"))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from account_credential where account_id = ?", Long.class,
                gmail)).isEqualTo(1L);
    }

    @Test
    void anAccountWhoseProviderHasNoRevocationRevokesNothing() throws Exception {
        UUID fake = registration.register(new RegisterAccountCommand(owner, ProviderType.of("fake"),
                new AccountProfile("bot-1", "Bot", null), new TokenCredentials("bot-token-123"), null));

        remove(fake).andExpect(status().isNoContent());

        google.verify(0, anyRequestedFor(anyUrl()));
    }

    // No module listens to AccountRemoved yet, so Spring Modulith stores nothing; this keeps it so once one does.
    @Test
    void theEventLogHoldsNoToken() throws Exception {
        remove(gmailAccount()).andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from event_publication where serialized_event like ? "
                + "or serialized_event like ?", Long.class, "%" + REFRESH + "%", "%" + ACCESS + "%")).isZero();
    }

    private UUID gmailAccount() {
        return registration.register(new RegisterAccountCommand(owner, ProviderType.of("gmail"),
                new AccountProfile("110248495921238986420", "owner@gmail.test", null),
                new OAuth2Credentials(ACCESS, null, Set.of(GMAIL_READONLY)), REFRESH));
    }

    private ResultActions remove(UUID accountId) throws Exception {
        return mvc.perform(delete("/api/accounts/" + accountId).with(user("owner@sino.test")).with(csrf()));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Extras {

        static volatile UUID failTheRemovalOf;

        @Bean
        FakeMessageProvider fakeProvider() {
            return FakeMessageProvider.builder("fake").build();
        }

        // Runs inside the removal transaction, so throwing rolls the removal back.
        @EventListener
        void failTheRemoval(AccountRemoved removed) {
            if (removed.accountId().equals(failTheRemovalOf)) {
                throw new IllegalStateException("simulated failure inside the removal transaction");
            }
        }

    }

}
