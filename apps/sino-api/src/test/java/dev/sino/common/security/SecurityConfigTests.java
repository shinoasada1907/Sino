package dev.sino.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The access rules of {@link SecurityConfig} (D-22, D-32). The sign-in flow itself, with real cookies, is covered
 * by {@code AuthApiTests}.
 */
@WebMvcTest(SecurityConfigTests.ProbeController.class)
@Import({ ApiSecurityTestConfiguration.class, SecurityConfigTests.ProbeController.class })
@ActiveProfiles("test")
class SecurityConfigTests {

    @Autowired
    private MockMvc mvc;

    @Test
    void rejectsApiRequestsWithoutASignedInUserAndOpensNoBrowserDialog() throws Exception {
        mvc.perform(get("/api/probe"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("WWW-Authenticate"))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void doesNotAcceptHttpBasicAnyMore() throws Exception {
        mvc.perform(get("/api/probe").with(httpBasic("owner@sino.test", "test-owner-password")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void acceptsASignedInUser() throws Exception {
        mvc.perform(get("/api/probe").with(user("owner@sino.test")))
                .andExpect(status().isOk());
    }

    @Test
    void changesNeedACsrfToken() throws Exception {
        mvc.perform(post("/api/probe").with(user("owner@sino.test")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mvc.perform(post("/api/probe").with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isOk());
    }

    @Test
    void theSignInEndpointsAreReachableWithoutASignedInUser() throws Exception {
        // No controller for them in this slice: 404 instead of 401 shows the security rules let them through.
        mvc.perform(get("/api/auth/me")).andExpect(status().isNotFound());
        mvc.perform(post("/api/auth/login").with(csrf())).andExpect(status().isNotFound());
    }

    // Even without invalidation the stored sign-in would be emptied, so only the session object shows it is ended.
    @Test
    void signingOutEndsTheSession() throws Exception {
        MockHttpSession session = new MockHttpSession();

        mvc.perform(post("/api/auth/logout").session(session).with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void deniesPathsOutsideApiEvenWhenSignedIn() throws Exception {
        mvc.perform(get("/internal/probe").with(user("owner@sino.test")))
                .andExpect(status().isForbidden());
    }

    @RestController
    static class ProbeController {

        @GetMapping({ "/api/probe", "/internal/probe" })
        String probe() {
            return "ok";
        }

        @PostMapping("/api/probe")
        String change() {
            return "ok";
        }

    }

}
