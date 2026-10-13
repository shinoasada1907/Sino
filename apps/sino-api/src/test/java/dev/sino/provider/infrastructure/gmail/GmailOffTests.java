package dev.sino.provider.infrastructure.gmail;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import dev.sino.TestcontainersConfiguration;

/**
 * The whole application before any Google project exists: no Google client and no public base URL. It still
 * starts, Gmail is not listed, and connecting Gmail is an unknown provider.
 */
@SpringBootTest(properties = { "sino.google.client-id=", "sino.google.client-secret=", "sino.public-base-url=" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class GmailOffTests {

    @Autowired
    private MockMvc mvc;

    @Test
    void gmailIsNotAProvider() throws Exception {
        mvc.perform(get("/api/providers").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].type", not(hasItem("gmail"))));
    }

    @Test
    void connectingGmailIsAnUnknownProvider() throws Exception {
        mvc.perform(post("/api/accounts/connect/gmail").with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("UNKNOWN_PROVIDER"));
    }

}
