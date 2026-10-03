package dev.sino.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(SecurityConfigTests.ProbeController.class)
@Import({ SecurityConfig.class, SecurityConfigTests.ProbeController.class })
@ActiveProfiles("test")
class SecurityConfigTests {

    @Autowired
    private MockMvc mvc;

    @Test
    void rejectsApiRequestWithoutCredentials() throws Exception {
        mvc.perform(get("/api/probe"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", startsWith("Basic")));
    }

    @Test
    void rejectsApiRequestWithWrongPassword() throws Exception {
        mvc.perform(get("/api/probe").with(httpBasic("test-user", "wrong-password")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void acceptsApiRequestWithValidCredentialsWithoutCreatingSession() throws Exception {
        mvc.perform(get("/api/probe").with(httpBasic("test-user", "test-password")))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getRequest().getSession(false)).isNull());
    }

    @Test
    void deniesPathsOutsideApiEvenWhenAuthenticated() throws Exception {
        mvc.perform(get("/internal/probe").with(httpBasic("test-user", "test-password")))
                .andExpect(status().isForbidden());
    }

    @RestController
    static class ProbeController {

        @GetMapping({ "/api/probe", "/internal/probe" })
        String probe() {
            return "ok";
        }

    }

}
