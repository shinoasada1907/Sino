package dev.sino.provider.infrastructure.gmail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import dev.sino.TestcontainersConfiguration;

/**
 * The whole application with a Google client: Gmail is listed, and Spring Boot's own OAuth2 client support stays
 * off because Sino keeps the credentials itself (D-38).
 */
@SpringBootTest(properties = { "sino.google.client-id=1234567890-test.apps.googleusercontent.test",
        "sino.google.client-secret=GOCSPX-test-client-secret-value" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class GmailWiringTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ApplicationContext context;

    @Test
    void gmailIsAProvider() throws Exception {
        mvc.perform(get("/api/providers").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].type").value("gmail"))
                .andExpect(jsonPath("$[0].displayName").value("Gmail"))
                .andExpect(jsonPath("$[0].capabilities").isEmpty());
    }

    @Test
    void springBootDoesNotTurnOnItsOwnOAuth2Client() {
        assertThat(context.getBeanNamesForType(ClientRegistrationRepository.class)).isEmpty();
        assertThat(context.getBeanNamesForType(OAuth2AuthorizedClientService.class)).isEmpty();
        assertThat(context.getBeanNamesForType(OAuth2AuthorizedClientRepository.class)).isEmpty();
    }

}
