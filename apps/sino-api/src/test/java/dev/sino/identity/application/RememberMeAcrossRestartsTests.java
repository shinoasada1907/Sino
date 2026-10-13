package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.web.authentication.RememberMeServices;

/**
 * "Keep me signed in" must survive a restart (D-34). Each context below is one startup. BCrypt salts the password
 * hash at random, so every startup has a different hash; the cookie therefore cannot be signed with it.
 */
class RememberMeAcrossRestartsTests {

    private static final String EMAIL = "owner@sino.test";
    private static final String PASSWORD = "correct horse battery";
    private static final String KEY = "0123456789abcdef0123456789abcdef-test";

    @Test
    void aCookieFromBeforeARestartStillSignsIn() {
        Cookie cookie = issueCookie(startup(PASSWORD, KEY));

        Authentication afterRestart = signInWith(startup(PASSWORD, KEY), cookie);

        assertThat(afterRestart).isNotNull();
        assertThat(afterRestart.getName()).isEqualTo(EMAIL);
    }

    @Test
    void everyStartupHashesThePasswordDifferently() {
        assertThat(passwordHashOf(startup(PASSWORD, KEY))).isNotEqualTo(passwordHashOf(startup(PASSWORD, KEY)));
    }

    @Test
    void changingThePasswordSignsEveryBrowserOut() {
        Cookie cookie = issueCookie(startup(PASSWORD, KEY));

        assertThat(signInWith(startup("another password!", KEY), cookie)).isNull();
    }

    @Test
    void changingTheKeySignsEveryBrowserOut() {
        Cookie cookie = issueCookie(startup(PASSWORD, KEY));

        assertThat(signInWith(startup(PASSWORD, "another-key-0123456789abcdef-0123456"), cookie)).isNull();
    }

    @Test
    void theCookieHoldsNeitherThePasswordNorItsHash() {
        ApplicationContextRunner startup = startup(PASSWORD, KEY);
        Cookie cookie = issueCookie(startup);

        assertThat(cookie.getValue()).doesNotContain(PASSWORD);
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getMaxAge()).isEqualTo(30 * 24 * 60 * 60);
    }

    private static ApplicationContextRunner startup(String password, String key) {
        return new ApplicationContextRunner()
                .withUserConfiguration(LoginConfiguration.class, LoginSettings.class)
                .withPropertyValues("sino.owner.email=" + EMAIL, "sino.owner.display-name=Owner",
                        "sino.owner.password=" + password, "sino.auth.remember-me-key=" + key);
    }

    private static Cookie issueCookie(ApplicationContextRunner startup) {
        AtomicReference<Cookie> cookie = new AtomicReference<>();
        startup.run(context -> {
            MockHttpServletResponse response = new MockHttpServletResponse();
            context.getBean(RememberMeServices.class).loginSuccess(new MockHttpServletRequest(), response,
                    UsernamePasswordAuthenticationToken.authenticated(EMAIL, null,
                            AuthorityUtils.createAuthorityList("ROLE_OWNER")));
            cookie.set(response.getCookie("remember-me"));
        });
        assertThat(cookie.get()).as("a remember-me cookie was issued").isNotNull();
        return cookie.get();
    }

    private static Authentication signInWith(ApplicationContextRunner startup, Cookie cookie) {
        AtomicReference<Authentication> result = new AtomicReference<>();
        startup.run(context -> {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(cookie);
            result.set(context.getBean(RememberMeServices.class).autoLogin(request, new MockHttpServletResponse()));
        });
        return result.get();
    }

    private static String passwordHashOf(ApplicationContextRunner startup) {
        AtomicReference<String> hash = new AtomicReference<>();
        startup.run(context -> hash.set(context.getBean(LoginSettings.class).passwordHash()));
        return hash.get();
    }

}
