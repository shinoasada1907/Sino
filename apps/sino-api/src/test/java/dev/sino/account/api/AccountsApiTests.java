package dev.sino.account.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.OAuth2Credentials;

/**
 * The account read API through HTTP on the whole application and a real PostgreSQL: real security, real owner
 * lookup, real data. No mocks, so owner isolation is checked against rows that really belong to someone else.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class AccountsApiTests {

    private static final ProviderType FAKE = ProviderType.of("fake");
    private static final String ACCESS = "ya29.sample-access-token";
    private static final String REFRESH = "1//sample-refresh-token";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ConnectedAccountRepository accounts;

    @Autowired
    private CredentialStore credentials;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;
    private UUID otherUser;

    @BeforeEach
    void startFromNoAccounts() {
        jdbc.update("delete from connected_account");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
        otherUser = users.save(new AppUser("other@example.com", "Other")).id();
    }

    @Test
    void listsTheAccountsOfTheOwnerOldestFirst() throws Exception {
        UUID newer = connect(owner, FAKE, "newer@fake.test", "2026-10-05T04:00:00Z");
        UUID older = connect(owner, FAKE, "older@fake.test", "2026-10-05T03:15:00Z");
        connect(otherUser, FAKE, "other@fake.test", "2026-10-05T02:00:00Z");

        mvc.perform(get("/api/accounts").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(older.toString()))
                .andExpect(jsonPath("$[0].externalAccountId").value("older@fake.test"))
                .andExpect(jsonPath("$[0].createdAt").value("2026-10-05T03:15:00Z"))
                .andExpect(jsonPath("$[1].id").value(newer.toString()));
    }

    @Test
    void anEmptyArrayWhenTheOwnerHasNoAccount() throws Exception {
        connect(otherUser, FAKE, "other@fake.test", "2026-10-05T02:00:00Z");

        mvc.perform(get("/api/accounts").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().string("[]"));
    }

    @Test
    void showsOneAccountWithItsFieldsAndNoCredential() throws Exception {
        UUID id = connect(owner, FAKE, "me@fake.test", "2026-10-05T03:15:00Z");
        credentials.save(id, new OAuth2Credentials(ACCESS, null, Set.of("mail.read")), REFRESH);

        String body = mvc.perform(get("/api/accounts/{id}", id).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.provider").value("fake"))
                .andExpect(jsonPath("$.externalAccountId").value("me@fake.test"))
                .andExpect(jsonPath("$.displayName").value("Fake account"))
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()))
                .andExpect(jsonPath("$.status").value("CONNECTED"))
                .andExpect(jsonPath("$.syncEnabled").value(true))
                .andExpect(jsonPath("$.lastSyncedAt").value(nullValue()))
                .andExpect(jsonPath("$.capabilities", contains("READ_MESSAGES")))
                .andExpect(jsonPath("$.createdAt").value("2026-10-05T03:15:00Z"))
                .andExpect(jsonPath("$.updatedAt").value("2026-10-05T03:15:00Z"))
                .andReturn().getResponse().getContentAsString();

        Map<String, Object> fields = JsonPath.read(body, "$");
        assertThat(fields.keySet()).containsExactlyInAnyOrder("id", "provider", "externalAccountId", "displayName",
                "avatarUrl", "status", "syncEnabled", "lastSyncedAt", "capabilities", "createdAt", "updatedAt");
        assertThat(body).doesNotContain(ACCESS).doesNotContain(REFRESH).doesNotContain("mail.read");
    }

    @Test
    void anAccountOfAnotherUserLooksExactlyLikeOneThatDoesNotExist() throws Exception {
        UUID foreign = connect(otherUser, FAKE, "other@fake.test", "2026-10-05T03:15:00Z");
        UUID missing = UUID.randomUUID();

        String foreignBody = mvc.perform(get("/api/accounts/{id}", foreign).with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"))
                .andReturn().getResponse().getContentAsString();
        String missingBody = mvc.perform(get("/api/accounts/{id}", missing).with(apiUser()))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        // Only the requested path in "instance" may differ.
        assertThat(foreignBody.replace(foreign.toString(), "<id>"))
                .isEqualTo(missingBody.replace(missing.toString(), "<id>"));
    }

    @Test
    void aMalformedIdIsABadRequest() throws Exception {
        mvc.perform(get("/api/accounts/not-a-uuid").with(apiUser()))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void anAccountWhoseProviderHasNoConnectorAnyMoreHasNoCapabilities() throws Exception {
        connect(owner, ProviderType.of("gmail"), "me@gmail.com", "2026-10-05T03:15:00Z");

        mvc.perform(get("/api/accounts").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].provider").value("gmail"))
                .andExpect(jsonPath("$[0].capabilities", empty()));
    }

    @Test
    void needsAuthentication() throws Exception {
        mvc.perform(get("/api/accounts"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    /** Saves an account directly, then pins its timestamps so the expected order and JSON are known. */
    private UUID connect(UUID user, ProviderType provider, String externalAccountId, String createdAt) {
        UUID id = accounts.save(ConnectedAccount.register(user, provider, externalAccountId, "Fake account", null))
                .id();
        OffsetDateTime time = OffsetDateTime.ofInstant(Instant.parse(createdAt), ZoneOffset.UTC);
        jdbc.update("update connected_account set created_at = ?, updated_at = ? where id = ?", time, time, id);
        return id;
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
