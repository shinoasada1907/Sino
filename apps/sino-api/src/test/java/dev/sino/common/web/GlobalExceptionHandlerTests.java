package dev.sino.common.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON;
import static org.springframework.http.MediaType.TEXT_PLAIN;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Map;

import jakarta.servlet.http.Cookie;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;
import dev.sino.common.security.ApiSecurityTestConfiguration;

@WebMvcTest(GlobalExceptionHandlerTests.ErrorProbeController.class)
@Import({ ApiSecurityTestConfiguration.class, GlobalExceptionHandlerTests.ErrorProbeController.class })
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class GlobalExceptionHandlerTests {

    @Autowired
    private MockMvc mvc;

    @Test
    void validationFailureListsFieldErrors() throws Exception {
        mvc.perform(post("/api/probe/things").with(apiUser()).with(csrf()).contentType(APPLICATION_JSON).content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                // Spring 7 omits `type` when it is about:blank, which RFC 9457 section 3.1.1 allows.
                .andExpect(jsonPath("$.type").doesNotExist())
                .andExpect(jsonPath("$.title").value("Bad Request"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.instance").value("/api/probe/things"))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("name"))
                .andExpect(jsonPath("$.errors[0].message").isNotEmpty());
    }

    @Test
    void malformedJsonIsReportedAsMalformedRequest() throws Exception {
        mvc.perform(post("/api/probe/things").with(apiUser()).with(csrf()).contentType(APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void moduleErrorCodeOfCategoryNotFoundBecomes404() throws Exception {
        mvc.perform(get("/api/probe/things/42").with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("THING_NOT_FOUND"))
                .andExpect(jsonPath("$.detail").value("Thing 42 was not found."))
                .andExpect(jsonPath("$.instance").value("/api/probe/things/42"));
    }

    @Test
    void moduleErrorCodeOfCategoryInvalidBecomes422() throws Exception {
        mvc.perform(get("/api/probe/rule").with(apiUser()))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("THING_RULE_BROKEN"));
    }

    @Test
    void unknownApiPathIsResourceNotFound() throws Exception {
        mvc.perform(get("/api/probe/nowhere").with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void wrongMethodIsMethodNotAllowed() throws Exception {
        mvc.perform(delete("/api/probe/things").with(apiUser()).with(csrf()))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @Test
    void wrongContentTypeIsUnsupportedMediaType() throws Exception {
        mvc.perform(post("/api/probe/things").with(apiUser()).with(csrf()).contentType(TEXT_PLAIN).content("name"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
    }

    @Test
    void optimisticLockingFailureIsConcurrentModification() throws Exception {
        mvc.perform(get("/api/probe/conflict").with(apiUser()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));
    }

    @Test
    void unexpectedExceptionHidesItsDetails() throws Exception {
        mvc.perform(get("/api/probe/boom").with(apiUser()))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred."))
                .andExpect(content().string(not(containsString("IllegalStateException"))))
                .andExpect(content().string(not(containsString("secret-value"))));
    }

    @Test
    void missingCredentialsGiveUnauthorizedProblem() throws Exception {
        mvc.perform(get("/api/probe/things/42"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("WWW-Authenticate"))
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void deniedPathGivesForbiddenProblem() throws Exception {
        mvc.perform(get("/internal/anything").with(apiUser()))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void missingCsrfTokenGivesCsrfProblem() throws Exception {
        mvc.perform(post("/api/probe/things").with(apiUser()).contentType(APPLICATION_JSON).content("{\"name\":\"a\"}"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void unexpectedErrorIsLoggedWithoutCookiesOrTokens(CapturedOutput output) throws Exception {
        mvc.perform(get("/api/probe/boom").with(apiUser())
                        .cookie(new Cookie("remember-me", "Secret-Cookie-Value"))
                        .header("X-XSRF-TOKEN", "Secret-Csrf-Value"))
                .andExpect(status().isInternalServerError());

        assertThat(output).contains("Unhandled exception for GET /api/probe/boom")
                .doesNotContain("Secret-Cookie-Value")
                .doesNotContain("Secret-Csrf-Value");
    }

    @Test
    void aRejectedAuthorizationHeaderIsNotLogged(CapturedOutput output) throws Exception {
        mvc.perform(get("/api/probe/things/1").header("Authorization", "Basic Wr0ng-Secret-Value"))
                .andExpect(status().isUnauthorized());

        assertThat(output).doesNotContain("Wr0ng-Secret-Value");
    }

    @Test
    void extraMembersOfASinoExceptionGoIntoTheProblem() throws Exception {
        mvc.perform(get("/api/probe/rule-with-attempts").with(apiUser()))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("THING_RULE_BROKEN"))
                .andExpect(jsonPath("$.attemptsLeft").value(2))
                .andExpect(header().doesNotExist("Retry-After"));
    }

    @Test
    void aRateLimitWithRetryAfterSecondsSendsTheRetryAfterHeader() throws Exception {
        mvc.perform(get("/api/probe/limited").with(apiUser()))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "30"))
                .andExpect(jsonPath("$.retryAfterSeconds").value(30));
    }

    @Test
    void instantIsWrittenAsIsoStringInUtc() throws Exception {
        mvc.perform(get("/api/probe/time").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.at").value("2026-10-01T00:00:00Z"));
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

    enum ProbeErrorCode implements ErrorCode {

        THING_NOT_FOUND(ErrorCategory.NOT_FOUND),
        THING_RULE_BROKEN(ErrorCategory.INVALID),
        SLOW_DOWN(ErrorCategory.RATE_LIMITED);

        private final ErrorCategory category;

        ProbeErrorCode(ErrorCategory category) {
            this.category = category;
        }

        @Override
        public ErrorCategory category() {
            return category;
        }

    }

    record Thing(@NotBlank String name) {
    }

    record Stamp(Instant at) {
    }

    @RestController
    @RequestMapping("/api/probe")
    static class ErrorProbeController {

        @PostMapping("/things")
        Thing create(@Valid @RequestBody Thing thing) {
            return thing;
        }

        @GetMapping("/things/{id}")
        Thing find(@PathVariable String id) {
            throw new SinoException(ProbeErrorCode.THING_NOT_FOUND, "Thing " + id + " was not found.");
        }

        @GetMapping("/limited")
        void slowDown() {
            throw new SinoException(ProbeErrorCode.SLOW_DOWN, "Slow down.", Map.of("retryAfterSeconds", 30L));
        }

        @GetMapping("/rule-with-attempts")
        void breakRuleWithAttemptsLeft() {
            throw new SinoException(ProbeErrorCode.THING_RULE_BROKEN, "Not now.", Map.of("attemptsLeft", 2));
        }

        @GetMapping("/rule")
        void breakRule() {
            throw new SinoException(ProbeErrorCode.THING_RULE_BROKEN, "This thing cannot be changed now.");
        }

        @GetMapping("/conflict")
        void conflict() {
            throw new OptimisticLockingFailureException("version mismatch");
        }

        @GetMapping("/boom")
        void boom() {
            throw new IllegalStateException("secret-value leaked");
        }

        @GetMapping("/time")
        Stamp time() {
            return new Stamp(Instant.parse("2026-10-01T00:00:00Z"));
        }

    }

}
