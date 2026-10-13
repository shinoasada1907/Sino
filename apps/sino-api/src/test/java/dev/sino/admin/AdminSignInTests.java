package dev.sino.admin;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.Browser;
import dev.sino.Browser.Response;
import dev.sino.TestcontainersConfiguration;

/**
 * The admin signs in like the owner but is kept apart from it (D-262, D-263), checked against a real server through
 * a cookie-keeping client, the way a browser sees it. The admin is {@code sino.admin.*} of the test profile.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class AdminSignInTests {

    private static final String ADMIN = "admin@sino.test";
    private static final String ADMIN_PASSWORD = "test-admin-password";
    private static final String OWNER = "owner@sino.test";
    private static final String OWNER_PASSWORD = "test-owner-password";

    @LocalServerPort
    private int port;

    private Browser browser;

    @BeforeEach
    void openABrowser() {
        browser = new Browser("http://localhost:" + port);
    }

    @Test
    void theAdminSignsInAndAdminMeNamesIt() {
        Response login = browser.signIn(" Admin@Sino.Test ", ADMIN_PASSWORD, false);

        assertThat(login.status()).isEqualTo(204);
        assertThat(login.setCookie("JSESSIONID")).isPresent();
        Response me = browser.get("/api/admin/me");
        assertThat(me.status()).isEqualTo(200);
        assertThat(me.json("$.email")).isEqualTo(ADMIN);
    }

    @Test
    void theAdminNeverGetsARememberMeCookie() {
        Response login = browser.signIn(ADMIN, ADMIN_PASSWORD, true);

        assertThat(login.status()).isEqualTo(204);
        assertThat(login.setCookie("remember-me")).isEmpty();
    }

    @Test
    void theOwnerWebSeesAnAdminSessionAsSignedOut() {
        browser.signIn(ADMIN, ADMIN_PASSWORD, false);

        Response me = browser.get("/api/auth/me");

        assertThat(me.status()).isEqualTo(401);
        assertThat(me.json("$.code")).isEqualTo("UNAUTHORIZED");
    }

    @Test
    void theAdminCannotReadTheOwnersApi() {
        browser.signIn(ADMIN, ADMIN_PASSWORD, false);

        for (String path : new String[] { "/api/accounts", "/api/conversations", "/api/providers" }) {
            Response response = browser.get(path);

            assertThat(response.status()).as(path).isEqualTo(403);
            assertThat(response.json("$.code")).as(path).isEqualTo("FORBIDDEN");
        }
    }

    @Test
    void theOwnerCannotReadTheAdminApi() {
        browser.signIn(OWNER, OWNER_PASSWORD, false);

        Response me = browser.get("/api/admin/me");

        assertThat(me.status()).isEqualTo(403);
        assertThat(me.json("$.code")).isEqualTo("FORBIDDEN");
        assertThat(browser.get("/api/accounts").status()).as("the owner keeps its own API").isEqualTo(200);
    }

    // Spring Security asks a caller signed in by remember-me alone to sign in fully when it is refused: 401, not 403.
    @Test
    void theOwnersRememberMeCookieDoesNotOpenTheAdminApi() {
        browser.signIn(OWNER, OWNER_PASSWORD, true);
        browser.forget("JSESSIONID");

        Response me = browser.get("/api/admin/me");

        assertThat(me.status()).isEqualTo(401);
        assertThat(me.json("$.code")).isEqualTo("UNAUTHORIZED");
        assertThat(browser.get("/api/accounts").status()).as("the cookie still opens the owner's API").isEqualTo(200);
    }

    @Test
    void nobodySignedInIs401() {
        Response me = browser.get("/api/admin/me");

        assertThat(me.status()).isEqualTo(401);
        assertThat(me.json("$.code")).isEqualTo("UNAUTHORIZED");
    }

    @Test
    void aWrongAdminPasswordIsAnsweredLikeTheOwnersOne() {
        Response login = browser.signIn(ADMIN, "not-the-admin-password", false);

        assertThat(login.status()).isEqualTo(401);
        assertThat(login.json("$.code")).isEqualTo("INVALID_CREDENTIALS");
        assertThat(login.value("$.remainingAttempts")).isInstanceOf(Integer.class);
        assertThat(login.setCookie("JSESSIONID")).isEmpty();
    }

    @Test
    void theAdminSignsOut() {
        browser.signIn(ADMIN, ADMIN_PASSWORD, false);

        Response logout = browser.send("POST", "/api/auth/logout", null, true);

        assertThat(logout.status()).isEqualTo(204);
        assertThat(browser.get("/api/admin/me").status()).isEqualTo(401);
    }

}
