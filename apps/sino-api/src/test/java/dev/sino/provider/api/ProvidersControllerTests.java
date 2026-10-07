package dev.sino.provider.api;

import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.BDDMockito.given;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import dev.sino.common.security.ApiSecurityTestConfiguration;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderDescriptor;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderType;

@WebMvcTest(ProvidersController.class)
@Import(ApiSecurityTestConfiguration.class)
@ActiveProfiles("test")
class ProvidersControllerTests {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProviderRegistry registry;

    @Test
    void listsEveryProviderInTheRegistryOrder() throws Exception {
        given(registry.descriptors()).willReturn(List.of(
                new ProviderDescriptor(ProviderType.of("fake"), "Fake", ProviderCapabilities.of(READ_MESSAGES)),
                new ProviderDescriptor(ProviderType.of("fake-mail"), "Fake Mail",
                        ProviderCapabilities.of(SEND_MESSAGES, READ_MESSAGES))));

        mvc.perform(get("/api/providers").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].*", hasSize(3)))
                .andExpect(jsonPath("$[0].type").value("fake"))
                .andExpect(jsonPath("$[0].displayName").value("Fake"))
                .andExpect(jsonPath("$[0].capabilities", contains("READ_MESSAGES")))
                .andExpect(jsonPath("$[1].type").value("fake-mail"))
                .andExpect(jsonPath("$[1].displayName").value("Fake Mail"))
                .andExpect(jsonPath("$[1].capabilities", contains("READ_MESSAGES", "SEND_MESSAGES")));
    }

    @Test
    void anEmptyArrayWhenNoProviderIsSupported() throws Exception {
        given(registry.descriptors()).willReturn(List.of());

        mvc.perform(get("/api/providers").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().string("[]"));
    }

    @Test
    void needsAuthentication() throws Exception {
        mvc.perform(get("/api/providers"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

}
