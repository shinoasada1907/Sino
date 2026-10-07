package dev.sino.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.Container.ExecResult;
import org.testcontainers.postgresql.PostgreSQLContainer;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.OAuth2Credentials;

/**
 * F02 acceptance (BE-18): one account through its whole life on the whole application, with verbose logging on.
 * Connected through the use case the F04 connect flow will call, then listed, shown, changed and removed over
 * HTTP. The sample tokens must never show up in a response, in the log or in a database column.
 */
@SpringBootTest(properties = {
        "logging.level.dev.sino=DEBUG",
        "logging.level.org.springframework.web=DEBUG",
        "logging.level.org.hibernate.SQL=DEBUG" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class AccountLifecycleEndToEndTests {

    private static final ProviderType FAKE = ProviderType.of("fake");
    private static final String ACCESS = "ya29.e2e-sample-access-token";
    private static final String REFRESH = "1//e2e-sample-refresh-token";

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PostgreSQLContainer postgres;

    private final List<String> responses = new ArrayList<>();

    @Test
    void anAccountGoesThroughItsWholeLifeWithoutItsTokensShowingAnywhere(CapturedOutput output) throws Exception {
        UUID owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        UUID id = registration.register(new RegisterAccountCommand(owner, FAKE,
                new AccountProfile("me@fake.test", "Me", null),
                new OAuth2Credentials(ACCESS, Instant.parse("2026-10-07T10:00:00Z"), Set.of("mail.read")), REFRESH));

        // The database holds ciphertext only, read with the real psql inside the database container.
        String stored = psql("select credential_type || '|' || encryption_key_id || '|' || access_token_enc || '|' "
                + "|| refresh_token_enc from account_credential where account_id = '" + id + "'");
        assertThat(stored).startsWith("OAUTH2|k1|").doesNotContain(ACCESS).doesNotContain(REFRESH);
        System.out.println("psql account_credential: " + stored);

        record(mvc.perform(get("/api/accounts").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id.toString())));
        record(mvc.perform(get("/api/accounts/{id}", id).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.capabilities[0]").value("READ_MESSAGES")));
        record(mvc.perform(patch("/api/accounts/{id}", id).with(apiUser()).contentType(APPLICATION_JSON)
                        .content("{\"displayName\": \"Work\", \"enabled\": false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Work"))
                .andExpect(jsonPath("$.status").value("DISABLED")));
        record(mvc.perform(delete("/api/accounts/{id}", id).with(apiUser()))
                .andExpect(status().isNoContent()));
        record(mvc.perform(get("/api/accounts/{id}", id).with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND")));

        assertThat(jdbc.queryForObject("select count(*) from account_credential", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select removed_at is not null from connected_account where id = ?",
                Boolean.class, id)).isTrue();
        assertThat(responses).hasSize(5).allSatisfy(body -> assertThat(body)
                .doesNotContain(ACCESS).doesNotContain(REFRESH).doesNotContain("mail.read"));
        // The verbose log really ran (handler mapping, written response bodies, SQL) and still holds no token.
        assertThat(output.getAll())
                .contains("Mapped to dev.sino.account.api.AccountsController")
                .contains("Writing [AccountResponse[")
                .contains("insert into account_credential")
                .doesNotContain(ACCESS)
                .doesNotContain(REFRESH);
    }

    private void record(ResultActions result) throws Exception {
        responses.add(result.andReturn().getResponse().getContentAsString());
    }

    private String psql(String query) throws Exception {
        ExecResult result = postgres.execInContainer("psql", "-U", postgres.getUsername(), "-d",
                postgres.getDatabaseName(), "-A", "-t", "-c", query);
        assertThat(result.getExitCode()).as(result.getStderr()).isZero();
        return result.getStdout().trim();
    }

    private static RequestPostProcessor apiUser() {
        return httpBasic("test-user", "test-password");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeProviders {

        @Bean
        FakeMessageProvider fakeProvider() {
            return FakeMessageProvider.builder("fake").build();
        }

    }

}
