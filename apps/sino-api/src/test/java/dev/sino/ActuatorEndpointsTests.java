package dev.sino;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.endpoint.web.PathMappedEndpoints;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ActuatorEndpointsTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private PathMappedEndpoints webEndpoints;

    @Test
    void healthIsPublicAndHidesComponentsFromAnonymousCallers() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist());
    }

    @Test
    void healthShowsComponentsToASignedInUser() throws Exception {
        mvc.perform(get("/actuator/health").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.db.status").value("UP"));
    }

    @Test
    void livenessAndReadinessArePublic() throws Exception {
        mvc.perform(get("/actuator/health/liveness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void onlyHealthAndInfoAreExposedOverHttp() {
        assertThat(webEndpoints.getAllRootPaths()).containsExactlyInAnyOrder("health", "info");
    }

    @Test
    void sensitiveEndpointsNeedLoginAndAreNotExposed() throws Exception {
        for (String path : new String[] { "/actuator/env", "/actuator/configprops", "/actuator/heapdump" }) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).with(user("owner@sino.test"))).andExpect(status().isNotFound());
        }
    }

}
