package dev.sino.account.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.util.UriComponentsBuilder;

import com.jayway.jsonpath.JsonPath;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.application.AccountManagementService;
import dev.sino.account.application.AccountRegistrationService;
import dev.sino.account.application.RegisterAccountCommand;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.OAuth2Credentials;

/**
 * Starting a connection on the whole application, with Gmail on (a fake Google client) and a fake connector that
 * does not use OAuth2. Google itself is never called here: starting only builds the consent address.
 */
@SpringBootTest(properties = { "sino.google.client-id=1234567890-test.apps.googleusercontent.test",
        "sino.google.client-secret=GOCSPX-test-client-secret-value" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, ConnectApiTests.FakeProviders.class })
@ActiveProfiles("test")
class ConnectApiTests {

    private static final String SUB = "110248495921238986420";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private AccountManagementService management;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;

    @BeforeEach
    void startFromNoAccounts() {
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    @Test
    void startsAGmailConnection() throws Exception {
        MockHttpSession session = new MockHttpSession();

        Map<String, String> query = queryOf(start(post("/api/accounts/connect/gmail"), session)
                .andExpect(status().isOk()));

        assertThat(query).containsEntry("client_id", "1234567890-test.apps.googleusercontent.test")
                .containsEntry("redirect_uri", "http://localhost:5173/api/accounts/connect/gmail/callback")
                .containsEntry("response_type", "code")
                .containsEntry("access_type", "offline")
                .containsEntry("prompt", "consent")
                .containsEntry("code_challenge_method", "S256")
                .containsKey("code_challenge")
                .doesNotContainKey("login_hint");
        assertThat(query.get("scope").split(" ")).containsExactlyInAnyOrder("openid", "email",
                "https://www.googleapis.com/auth/gmail.readonly");
        assertThat(pendingIn(session).take(query.get("state"), Instant.now())).get()
                .satisfies(pending -> {
                    assertThat(pending.provider()).isEqualTo("gmail");
                    assertThat(pending.ownerId()).isEqualTo(owner);
                    assertThat(pending.accountId()).isNull();
                });
    }

    @Test
    void anEmptyBodyAlsoStartsANewConnection() throws Exception {
        start(post("/api/accounts/connect/gmail").contentType(APPLICATION_JSON).content("{}"), new MockHttpSession())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authorizationUrl").isString());
    }

    @Test
    void eachStartHasItsOwnStateAndBothStayUsable() throws Exception {
        MockHttpSession session = new MockHttpSession();

        String first = queryOf(start(post("/api/accounts/connect/gmail"), session)).get("state");
        String second = queryOf(start(post("/api/accounts/connect/gmail"), session)).get("state");

        assertThat(second).isNotEqualTo(first);
        PendingConnects pending = pendingIn(session);
        assertThat(pending.take(first, Instant.now())).isPresent();
        assertThat(pending.take(second, Instant.now())).isPresent();
    }

    @Test
    void reconnectingAsksGoogleForThatAccount() throws Exception {
        UUID gmail = connectGmail();
        MockHttpSession session = new MockHttpSession();

        Map<String, String> query = queryOf(start(post("/api/accounts/connect/gmail").contentType(APPLICATION_JSON)
                .content("{\"accountId\": \"" + gmail + "\"}"), session).andExpect(status().isOk()));

        assertThat(query).containsEntry("login_hint", SUB);
        assertThat(pendingIn(session).take(query.get("state"), Instant.now())).get()
                .extracting(pending -> pending.accountId()).isEqualTo(gmail);
    }

    @Test
    void aRemovedAccountCannotBeReconnected() throws Exception {
        UUID gmail = connectGmail();
        management.remove(owner, gmail);

        reconnect("gmail", gmail).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
    }

    @Test
    void anAccountOfAnotherProviderIsNotFoundForGmail() throws Exception {
        UUID fake = registration.register(new RegisterAccountCommand(owner, ProviderType.of("fake"),
                new AccountProfile("me@fake.test", "Me", null), credentials(), null));

        reconnect("gmail", fake).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
    }

    @Test
    void anUnknownAccountIsNotFound() throws Exception {
        reconnect("gmail", UUID.randomUUID()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_FOUND"));
    }

    @Test
    void anUnknownProviderIsNotFound() throws Exception {
        start(post("/api/accounts/connect/nope"), new MockHttpSession())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("UNKNOWN_PROVIDER"));
        start(post("/api/accounts/connect/NOT A TYPE"), new MockHttpSession())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("UNKNOWN_PROVIDER"));
    }

    @Test
    void aProviderWithoutOAuth2CannotBeConnectedThisWay() throws Exception {
        start(post("/api/accounts/connect/fake"), new MockHttpSession())
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("CONNECT_NOT_SUPPORTED"));
    }

    @Test
    void aMalformedAccountIdIsABadRequest() throws Exception {
        start(post("/api/accounts/connect/gmail").contentType(APPLICATION_JSON).content("{\"accountId\": \"x\"}"),
                new MockHttpSession())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void needsTheCsrfToken() throws Exception {
        mvc.perform(post("/api/accounts/connect/gmail").with(user("owner@sino.test")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void needsASignedInUser() throws Exception {
        mvc.perform(post("/api/accounts/connect/gmail").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions start(MockHttpServletRequestBuilder request, MockHttpSession session) throws Exception {
        return mvc.perform(request.session(session).with(user("owner@sino.test")).with(csrf()));
    }

    private ResultActions reconnect(String provider, UUID accountId) throws Exception {
        return start(post("/api/accounts/connect/" + provider).contentType(APPLICATION_JSON)
                .content("{\"accountId\": \"" + accountId + "\"}"), new MockHttpSession());
    }

    private UUID connectGmail() {
        return registration.register(new RegisterAccountCommand(owner, ProviderType.of("gmail"),
                new AccountProfile(SUB, "owner@gmail.test", null), credentials(), "1//sample-refresh-token"));
    }

    private static OAuth2Credentials credentials() {
        return new OAuth2Credentials("ya29.sample-access-token", null, Set.of("openid"));
    }

    private static PendingConnects pendingIn(MockHttpSession session) {
        Object pending = session.getAttribute(PendingConnects.SESSION_ATTRIBUTE);
        assertThat(pending).as("pending connects in the session").isInstanceOf(PendingConnects.class);
        return (PendingConnects) pending;
    }

    private static Map<String, String> queryOf(ResultActions result) throws Exception {
        String url = JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.authorizationUrl");
        return UriComponentsBuilder.fromUriString(url).build().getQueryParams().toSingleValueMap().entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey,
                        entry -> URLDecoder.decode(entry.getValue(), StandardCharsets.UTF_8)));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeProviders {

        @Bean
        FakeMessageProvider fakeProvider() {
            return FakeMessageProvider.builder("fake").build();
        }

    }

}
