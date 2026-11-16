package dev.sino.provider.infrastructure.zalo;

import static org.hamcrest.Matchers.contains;
import static org.springframework.http.MediaType.APPLICATION_JSON;
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
 * The whole application with Zalo off, as it starts by default (D-286): Zalo is listed, says it connects by QR code,
 * and cannot be connected.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ZaloOffWiringTests {

    private static final String ZALO = "$[?(@.type == 'zalo')]";

    @Autowired
    private MockMvc mvc;

    @Test
    void zaloIsListedButNotConnectable() throws Exception {
        mvc.perform(get("/api/providers").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath(ZALO + ".kind", contains("CHAT")))
                .andExpect(jsonPath(ZALO + ".connectMethod", contains("QR")))
                .andExpect(jsonPath(ZALO + ".connectable", contains(false)));
    }

    @Test
    void connectingZaloIsRefused() throws Exception {
        mvc.perform(post("/api/accounts/connect/zalo/qr").with(user("owner@sino.test")).with(csrf())
                .contentType(APPLICATION_JSON).content("{\"acceptRisk\": true}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PROVIDER_DISABLED"));
    }

}
