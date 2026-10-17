package dev.sino.provider.infrastructure.zalo;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
 * The whole application with Zalo turned on: the connector is a chat provider of the registry. No sino-zalo runs, and
 * starting does not call it.
 */
@SpringBootTest(properties = { "sino.zalo.enabled=true", "sino.zalo.secret=sino-zalo-test-secret-0123456789abcdef" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ZaloWiringTests {

    private static final String ZALO = "$[?(@.type == 'zalo')]";

    @Autowired
    private MockMvc mvc;

    @Test
    void zaloIsAChatProvider() throws Exception {
        mvc.perform(get("/api/providers").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath(ZALO + ".displayName", contains("Zalo")))
                .andExpect(jsonPath(ZALO + ".kind", contains("CHAT")))
                .andExpect(jsonPath(ZALO + ".capabilities", contains(empty())));
    }

}
