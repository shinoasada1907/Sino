package dev.sino.identity.api;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.TestcontainersConfiguration;

/**
 * {@code GET} and {@code PATCH /api/profile} and the {@code avatarUrl} of {@code /api/auth/me}, through HTTP on the
 * whole application and a real PostgreSQL (spec {@code user-profile-api}, {@code web-authentication}).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ProfileApiTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void resetTheProfile() {
        jdbc.update("update app_user set display_name = 'Test Owner', phone_number = null, job_title = null, "
                + "location = null, bio = null where email = 'owner@sino.test'");
    }

    private static MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder request) {
        return request.with(user("owner@sino.test")).with(csrf()).contentType(APPLICATION_JSON);
    }

    private String column(String column) {
        return jdbc.queryForObject("select " + column + " from app_user where email = 'owner@sino.test'",
                String.class);
    }

    @Test
    void aNewOwnerHasOnlyANameAndAnEmail() throws Exception {
        mvc.perform(get("/api/profile").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("owner@sino.test"))
                .andExpect(jsonPath("$.displayName").value("Test Owner"))
                .andExpect(jsonPath("$.phoneNumber").value(nullValue()))
                .andExpect(jsonPath("$.jobTitle").value(nullValue()))
                .andExpect(jsonPath("$.location").value(nullValue()))
                .andExpect(jsonPath("$.bio").value(nullValue()))
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()))
                .andExpect(jsonPath("$.role").value("OWNER"))
                .andExpect(jsonPath("$.joinedAt").isString());
    }

    @Test
    void readingTheProfileNeedsASignIn() throws Exception {
        mvc.perform(get("/api/profile"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void someFieldsAreChangedAndTrimmedAndTheOthersStay() throws Exception {
        mvc.perform(asOwner(patch("/api/profile"))
                .content("{\"phoneNumber\": \" +84 912 345 678 \", \"bio\": \"Dòng 1\\nDòng 2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phoneNumber").value("+84 912 345 678"))
                .andExpect(jsonPath("$.bio").value("Dòng 1\nDòng 2"))
                .andExpect(jsonPath("$.displayName").value("Test Owner"));

        mvc.perform(get("/api/profile").with(user("owner@sino.test")))
                .andExpect(jsonPath("$.phoneNumber").value("+84 912 345 678"))
                .andExpect(jsonPath("$.bio").value("Dòng 1\nDòng 2"));
    }

    @Test
    void aLaterChangeKeepsWhatAnEarlierOneSet() throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content("{\"jobTitle\": \"Engineer\"}")).andExpect(status().isOk());

        mvc.perform(asOwner(patch("/api/profile")).content("{\"location\": \"Hà Nội\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobTitle").value("Engineer"))
                .andExpect(jsonPath("$.location").value("Hà Nội"));
    }

    @Test
    void anEmptyOptionalFieldIsCleared() throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content("{\"jobTitle\": \"Engineer\"}")).andExpect(status().isOk());

        mvc.perform(asOwner(patch("/api/profile")).content("{\"jobTitle\": \"  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobTitle").value(nullValue()));
    }

    @Test
    void aNullFieldStaysAsItIs() throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content("{\"jobTitle\": \"Engineer\"}")).andExpect(status().isOk());

        mvc.perform(asOwner(patch("/api/profile")).content("{\"jobTitle\": null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobTitle").value("Engineer"));
    }

    @Test
    void anEmptyNameIsRefusedAndTheNameStays() throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content("{\"displayName\": \"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("displayName"));

        org.assertj.core.api.Assertions.assertThat(column("display_name")).isEqualTo("Test Owner");
    }

    @Test
    void aBadPhoneNumberIsRefusedAndNothingIsWritten() throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content("{\"displayName\": \"Changed\", \"phoneNumber\": \"gọi tôi\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("phoneNumber"));

        org.assertj.core.api.Assertions.assertThat(column("display_name")).isEqualTo("Test Owner");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"displayName\": \"%s\"}", "{\"phoneNumber\": \"%s\"}", "{\"jobTitle\": \"%s\"}",
            "{\"location\": \"%s\"}", "{\"bio\": \"%s\"}" })
    void aValueOverItsLimitIsRefused(String template) throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content(template.formatted("1".repeat(501))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void valuesAtTheirLimitsAreAccepted() throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content("{\"displayName\": \"" + "n".repeat(200)
                + "\", \"phoneNumber\": \"" + "1".repeat(30) + "\", \"jobTitle\": \"" + "j".repeat(100)
                + "\", \"location\": \"" + "l".repeat(100) + "\", \"bio\": \"" + "b".repeat(500) + "\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void emailAndRoleCannotBeChanged() throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content("{\"email\": \"khac@sino.test\", \"role\": \"ADMIN\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("email", "role")));

        org.assertj.core.api.Assertions.assertThat(column("email")).isEqualTo("owner@sino.test");
    }

    @Test
    void changingTheProfileNeedsACsrfToken() throws Exception {
        mvc.perform(patch("/api/profile").with(user("owner@sino.test")).contentType(APPLICATION_JSON)
                .content("{\"bio\": \"x\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void changingTheProfileNeedsASignIn() throws Exception {
        mvc.perform(patch("/api/profile").with(csrf()).contentType(APPLICATION_JSON).content("{\"bio\": \"x\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meShowsTheNewNameAndAnEmptyAvatarUrl() throws Exception {
        mvc.perform(asOwner(patch("/api/profile")).content("{\"displayName\": \"Tên mới\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/auth/me").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("owner@sino.test"))
                .andExpect(jsonPath("$.displayName").value("Tên mới"))
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()));
    }

}
