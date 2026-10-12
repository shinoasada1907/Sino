package dev.sino.account.api;

import static org.hamcrest.Matchers.contains;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;
import dev.sino.provider.SendingProviders;
import dev.sino.provider.spi.OAuth2Credentials;

/**
 * What each account can do (F10, D-130): its provider's capabilities, less sending while the account has not granted
 * the scope the connector sends with. Through the account API, with connectors that send or not.
 */
@SpringBootTest(properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, SendingProviders.class })
@ActiveProfiles("test")
class AccountCapabilitiesApiTests {

    private static final Set<String> READ_ONLY = Set.of("openid", SendingProviders.READ_SCOPE);
    private static final Set<String> READ_AND_SEND = Set.of("openid", SendingProviders.READ_SCOPE,
            SendingProviders.SEND_SCOPE);

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

    @BeforeEach
    void startFromNoAccounts() {
        jdbc.update("delete from connected_account");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    @Test
    void anAccountThatGrantedOnlyReadingCannotSend() throws Exception {
        UUID account = connect(SendingProviders.MAIL, "reader@mail.test", READ_ONLY);

        mvc.perform(get("/api/accounts/{id}", account).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.capabilities", contains("READ_MESSAGES")));
    }

    @Test
    void reconnectingWithTheSendScopeLetsTheAccountSend() throws Exception {
        UUID account = connect(SendingProviders.MAIL, "me@mail.test", READ_ONLY);

        // What a reconnect stores: the new grant replaces the credential.
        credentials.save(account, new OAuth2Credentials("ya29.again", null, READ_AND_SEND), "1//again");

        mvc.perform(get("/api/accounts/{id}", account).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.capabilities", contains("READ_MESSAGES", "SEND_MESSAGES")));
    }

    @Test
    void theListShowsWhatEachAccountCanDo() throws Exception {
        connect(SendingProviders.MAIL, "reader@mail.test", READ_ONLY);
        connect(SendingProviders.MAIL, "sender@mail.test", READ_AND_SEND);

        mvc.perform(get("/api/accounts").with(user("owner@sino.test")))
                .andExpect(jsonPath("$[0].externalAccountId").value("reader@mail.test"))
                .andExpect(jsonPath("$[0].capabilities", contains("READ_MESSAGES")))
                .andExpect(jsonPath("$[1].externalAccountId").value("sender@mail.test"))
                .andExpect(jsonPath("$[1].capabilities", contains("READ_MESSAGES", "SEND_MESSAGES")));
    }

    @Test
    void anAccountWithoutACredentialCannotSendOverOAuth2() throws Exception {
        UUID account = connect(SendingProviders.MAIL, "gone@mail.test", null);

        mvc.perform(get("/api/accounts/{id}", account).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.capabilities", contains("READ_MESSAGES")));
    }

    // Nothing to check for a connector that sends without OAuth2, and nothing to add to one that never sends.
    @Test
    void scopesMatterOnlyToAConnectorThatSendsOverOAuth2() throws Exception {
        UUID chat = connect(SendingProviders.CHAT, "me@chat.test", null);
        UUID reader = connect(SendingProviders.READER, "me@read.test", READ_AND_SEND);

        mvc.perform(get("/api/accounts/{id}", chat).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.capabilities", contains("READ_MESSAGES", "SEND_MESSAGES")));
        mvc.perform(get("/api/accounts/{id}", reader).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.capabilities", contains("READ_MESSAGES")));
    }

    // Oldest first, as the list orders them; no credential when scopes is null.
    private UUID connect(String provider, String externalAccountId, Set<String> scopes) {
        UUID id = accounts.save(ConnectedAccount.register(owner, ProviderType.of(provider), externalAccountId,
                externalAccountId, null, null)).id();
        if (scopes != null) {
            credentials.save(id, new OAuth2Credentials("ya29.sample", null, scopes), "1//sample");
        }
        return id;
    }

}
