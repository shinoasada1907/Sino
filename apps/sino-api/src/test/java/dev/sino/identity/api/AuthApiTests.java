package dev.sino.identity.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import dev.sino.TestcontainersConfiguration;

/**
 * Browser sign-in (D-22) against a real server on a random port, through a small cookie-keeping client: only a real
 * servlet container sends the session cookie, so HttpOnly, SameSite, session ID changes and remember-me can be
 * checked the way a browser sees them. The clock is a mock: every test starts one hour after the previous one, so
 * failed sign-ins of one test are forgotten by the next, and a test can let a lock run out (D-35).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class AuthApiTests {

    private static final String EMAIL = "owner@sino.test";
    private static final String PASSWORD = "test-owner-password";
    private static final Instant START = Instant.parse("2026-10-07T00:00:00Z");
    private static final AtomicLong HOURS = new AtomicLong();

    private static volatile Instant now = START;

    @MockitoBean
    private Clock clock;

    @LocalServerPort
    private int port;

    private Browser browser;

    @BeforeEach
    void openABrowser() {
        now = START.plus(Duration.ofHours(HOURS.incrementAndGet()));
        given(clock.instant()).willAnswer(invocation -> now);
        browser = new Browser("http://localhost:" + port);
    }

    @Test
    void meWithoutASessionIs401AndHandsOutACsrfCookie() {
        Response me = browser.get("/api/auth/me");

        assertThat(me.status()).isEqualTo(401);
        assertThat(me.json("$.code")).isEqualTo("UNAUTHORIZED");
        assertThat(me.header("WWW-Authenticate")).isEmpty();
        assertThat(me.setCookie("XSRF-TOKEN")).hasValueSatisfying(cookie -> assertThat(cookie)
                .as("JavaScript must be able to read the CSRF token").doesNotContainIgnoringCase("HttpOnly"));
    }

    @Test
    void signingInGivesAnHttpOnlyLaxSessionCookieAndMeKnowsTheOwner() {
        Response login = browser.signIn(EMAIL, PASSWORD, false);

        assertThat(login.status()).isEqualTo(204);
        assertThat(login.setCookie("JSESSIONID")).hasValueSatisfying(cookie -> assertThat(cookie)
                .containsIgnoringCase("HttpOnly").containsIgnoringCase("SameSite=Lax"));
        Response me = browser.get("/api/auth/me");
        assertThat(me.status()).isEqualTo(200);
        assertThat(me.json("$.email")).isEqualTo(EMAIL);
        assertThat(me.json("$.displayName")).isEqualTo("Test Owner");
        assertThat(me.body()).doesNotContainIgnoringCase("password");
    }

    @Test
    void theEmailIsMatchedTrimmedAndInLowerCase() {
        assertThat(browser.signIn(" Owner@SINO.test ", PASSWORD, false).status()).isEqualTo(204);
    }

    @Test
    void signingInAgainGivesANewSessionId() {
        browser.signIn(EMAIL, PASSWORD, false);
        String first = browser.cookie("JSESSIONID");

        browser.signIn(EMAIL, PASSWORD, false);

        assertThat(browser.cookie("JSESSIONID")).isNotNull().isNotEqualTo(first);
        Browser withTheOldId = new Browser("http://localhost:" + port).withCookie("JSESSIONID", first);
        assertThat(withTheOldId.get("/api/auth/me").status()).isEqualTo(401);
    }

    @Test
    void aWrongPasswordIs401InvalidCredentialsAndNoSession() {
        Response login = browser.signIn(EMAIL, "wrong-password-123", false);

        assertThat(login.status()).isEqualTo(401);
        assertThat(login.json("$.code")).isEqualTo("INVALID_CREDENTIALS");
        assertThat(login.header("WWW-Authenticate")).isEmpty();
        assertThat(browser.get("/api/auth/me").status()).isEqualTo(401);
    }

    @Test
    void anUnknownEmailGetsExactlyTheAnswerOfAWrongPassword() {
        Response wrongPassword = browser.signIn(EMAIL, "wrong-password-123", false);
        Response unknownEmail = new Browser("http://localhost:" + port)
                .signIn("someone@else.test", PASSWORD, false);

        assertThat(unknownEmail.status()).isEqualTo(wrongPassword.status());
        assertThat(unknownEmail.json("$.code")).isEqualTo(wrongPassword.json("$.code"));
        assertThat(unknownEmail.json("$.detail")).isEqualTo(wrongPassword.json("$.detail"));
        assertThat(unknownEmail.value("$.remainingAttempts")).isEqualTo(wrongPassword.value("$.remainingAttempts"));
    }

    @Test
    void theAttemptsLeftCountDownAndTheFifthWrongPasswordLocksForFifteenMinutes() {
        for (int left = 4; left >= 1; left--) {
            Response login = browser.signIn(EMAIL, "wrong-password-123", false);
            assertThat(login.status()).isEqualTo(401);
            assertThat(login.value("$.remainingAttempts")).isEqualTo(left);
        }

        Response fifth = browser.signIn(EMAIL, "wrong-password-123", false);

        assertThat(fifth.status()).isEqualTo(429);
        assertThat(fifth.json("$.code")).isEqualTo("LOGIN_LOCKED");
        assertThat(fifth.value("$.retryAfterSeconds")).isEqualTo(900);
        assertThat(fifth.header("Retry-After")).contains("900");
    }

    @Test
    void theRightPasswordIsRefusedWhileLockedAndNoSessionIsMade() {
        lockTheOwner();

        Response login = browser.signIn(EMAIL, PASSWORD, false);

        assertThat(login.status()).isEqualTo(429);
        assertThat(login.json("$.code")).isEqualTo("LOGIN_LOCKED");
        assertThat(browser.get("/api/auth/me").status()).isEqualTo(401);
    }

    @Test
    void theOwnerCanSignInAgainOnceTheLockRunsOut() {
        lockTheOwner();
        now = now.plus(Duration.ofMinutes(14));
        assertThat(browser.signIn(EMAIL, PASSWORD, false).status()).as("after 14 minutes").isEqualTo(429);

        now = now.plus(Duration.ofMinutes(1));

        assertThat(browser.signIn(EMAIL, PASSWORD, false).status()).as("after 15 minutes").isEqualTo(204);
    }

    @Test
    void aMissingPasswordIs400() {
        browser.get("/api/auth/me");

        Response login = browser.send("POST", "/api/auth/login",
                "{\"email\":\"" + EMAIL + "\",\"rememberMe\":false}", true);

        assertThat(login.status()).isEqualTo(400);
        assertThat(login.json("$.code")).isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void signingInWithoutTheCsrfTokenIs403AndNoSession() {
        browser.get("/api/auth/me");

        Response login = browser.send("POST", "/api/auth/login", loginJson(EMAIL, PASSWORD, false), false);

        assertThat(login.status()).isEqualTo(403);
        assertThat(login.json("$.code")).isEqualTo("CSRF_TOKEN_INVALID");
        assertThat(browser.get("/api/auth/me").status()).isEqualTo(401);
    }

    @Test
    void aChangeWithoutTheCsrfTokenIs403EvenWhenSignedIn() {
        browser.signIn(EMAIL, PASSWORD, false);

        Response patch = browser.send("PATCH", "/api/accounts/" + UUID.randomUUID(), "{\"displayName\":\"x\"}",
                false);

        assertThat(patch.status()).isEqualTo(403);
        assertThat(patch.json("$.code")).isEqualTo("CSRF_TOKEN_INVALID");
    }

    @Test
    void signingOutEndsTheSessionAndForgetsTheBrowser() {
        browser.signIn(EMAIL, PASSWORD, true);
        String session = browser.cookie("JSESSIONID");

        Response logout = browser.send("POST", "/api/auth/logout", null, true);

        assertThat(logout.status()).isEqualTo(204);
        assertThat(logout.setCookie("remember-me")).hasValueSatisfying(cookie -> assertThat(cookie)
                .as("the remember-me cookie is deleted: empty value, expired")
                .startsWith("remember-me=;").contains("Expires=Thu, 01 Jan 1970"));
        Browser withTheOldSession = new Browser("http://localhost:" + port).withCookie("JSESSIONID", session);
        assertThat(withTheOldSession.get("/api/accounts").status()).isEqualTo(401);
    }

    @Test
    void theRememberMeCookieSignsBackInWhenTheSessionIsGone() {
        Response login = browser.signIn(EMAIL, PASSWORD, true);
        assertThat(login.setCookie("remember-me")).hasValueSatisfying(cookie -> assertThat(cookie)
                .containsIgnoringCase("HttpOnly").containsIgnoringCase("Max-Age=2592000"));
        String oldSession = browser.cookie("JSESSIONID");

        browser.forget("JSESSIONID");
        Response me = browser.get("/api/auth/me");

        assertThat(me.status()).isEqualTo(200);
        assertThat(me.json("$.email")).isEqualTo(EMAIL);
        assertThat(browser.cookie("JSESSIONID")).as("a new session").isNotNull().isNotEqualTo(oldSession);
    }

    @Test
    void rememberMeMayBeLeftOut() {
        browser.get("/api/auth/me");

        Response login = browser.send("POST", "/api/auth/login",
                "{\"email\":\"" + EMAIL + "\",\"password\":\"" + PASSWORD + "\"}", true);

        assertThat(login.status()).isEqualTo(204);
        assertThat(login.setCookie("remember-me")).isEmpty();
    }

    @Test
    void noRememberMeCookieWhenItIsNotAsked() {
        Response login = browser.signIn(EMAIL, PASSWORD, false);

        assertThat(login.setCookie("remember-me")).isEmpty();
    }

    @Test
    void httpBasicIsNotAcceptedAnyMore() {
        String basic = Base64.getEncoder().encodeToString((EMAIL + ":" + PASSWORD).getBytes(StandardCharsets.UTF_8));

        Response accounts = browser.withHeader("Authorization", "Basic " + basic).get("/api/accounts");

        assertThat(accounts.status()).isEqualTo(401);
        assertThat(accounts.json("$.code")).isEqualTo("UNAUTHORIZED");
        assertThat(accounts.header("WWW-Authenticate")).isEmpty();
    }

    private void lockTheOwner() {
        for (int i = 0; i < 5; i++) {
            browser.signIn(EMAIL, "wrong-password-123", false);
        }
    }

    private static String loginJson(String email, String password, boolean rememberMe) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"rememberMe\":" + rememberMe + "}";
    }

    /** One HTTP response, with its Set-Cookie headers kept as they came. */
    record Response(int status, Map<String, List<String>> headers, String body) {

        Optional<String> header(String name) {
            return headers.entrySet().stream().filter(entry -> entry.getKey().equalsIgnoreCase(name))
                    .flatMap(entry -> entry.getValue().stream()).findFirst();
        }

        Optional<String> setCookie(String name) {
            return headers.entrySet().stream().filter(entry -> entry.getKey().equalsIgnoreCase("Set-Cookie"))
                    .flatMap(entry -> entry.getValue().stream())
                    .filter(cookie -> cookie.startsWith(name + "=")).findFirst();
        }

        String json(String path) {
            return JsonPath.read(body, path);
        }

        Object value(String path) {
            return JsonPath.read(body, path);
        }

    }

    /** Just enough of a browser: keeps cookies, sends the CSRF token back as a header when asked. */
    static final class Browser {

        private final HttpClient http = HttpClient.newHttpClient();
        private final String baseUrl;
        private final Map<String, String> cookies = new LinkedHashMap<>();
        private final Map<String, String> extraHeaders = new LinkedHashMap<>();

        Browser(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        Browser withCookie(String name, String value) {
            cookies.put(name, value);
            return this;
        }

        Browser withHeader(String name, String value) {
            extraHeaders.put(name, value);
            return this;
        }

        String cookie(String name) {
            return cookies.get(name);
        }

        void forget(String name) {
            cookies.remove(name);
        }

        Response get(String path) {
            return send("GET", path, null, false);
        }

        /** Gets a CSRF token first, as the web app does, then signs in. */
        Response signIn(String email, String password, boolean rememberMe) {
            if (!cookies.containsKey("XSRF-TOKEN")) {
                get("/api/auth/me");
            }
            return send("POST", "/api/auth/login", loginJson(email, password, rememberMe), true);
        }

        Response send(String method, String path, String json, boolean withCsrfToken) {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                    .header("Accept", "application/json")
                    .method(method, json == null ? HttpRequest.BodyPublishers.noBody()
                            : HttpRequest.BodyPublishers.ofString(json));
            if (json != null) {
                request.header("Content-Type", "application/json");
            }
            if (!cookies.isEmpty()) {
                request.header("Cookie", String.join("; ", cookies.entrySet().stream()
                        .map(cookie -> cookie.getKey() + "=" + cookie.getValue()).toList()));
            }
            if (withCsrfToken && cookies.containsKey("XSRF-TOKEN")) {
                request.header("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
            }
            extraHeaders.forEach(request::header);
            try {
                HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
                response.headers().allValues("Set-Cookie").forEach(this::remember);
                return new Response(response.statusCode(), response.headers().map(), response.body());
            } catch (IOException | InterruptedException e) {
                throw new IllegalStateException("Request failed: " + method + " " + path, e);
            }
        }

        private void remember(String setCookie) {
            String pair = setCookie.split(";", 2)[0];
            String name = pair.substring(0, pair.indexOf('='));
            String value = pair.substring(pair.indexOf('=') + 1);
            boolean deleted = setCookie.toLowerCase().contains("max-age=0") || value.isEmpty();
            if (deleted) {
                cookies.remove(name);
            } else {
                cookies.put(name, value);
            }
        }

    }

}
