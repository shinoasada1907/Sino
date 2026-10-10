package dev.sino.provider.infrastructure.gmail;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
 * Without the Pub/Sub settings there is no webhook of Gmail's notices (D-76): a push gets 404, whatever it carries.
 * The default test configuration, so the context of {@code ActuatorEndpointsTests}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class GmailWebhookOffTests {

    @Autowired
    private MockMvc mvc;

    @Test
    void withoutThePubSubSettingsThereIsNoWebhook() throws Exception {
        mvc.perform(post("/api/webhooks/gmail").contentType(APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/webhooks/gmail").header("Authorization", "Bearer a.b.c")
                .contentType(APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
    }

}
