package dev.sino.identity.application;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.RememberMeServices;

/**
 * Who may sign in, with which role (D-262), and that "keep me signed in" is for the owner only: the admin never gets
 * the cookie, and a cookie in the admin's name signs nobody in.
 */
class AdminLoginTests {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(LoginConfiguration.class, LoginSettings.class)
            .withPropertyValues("sino.owner.email=owner@example.com", "sino.owner.display-name=Owner",
                    "sino.owner.password=correct horse battery",
                    "sino.auth.remember-me-key=0123456789abcdef0123456789abcdef-test");

    private final ApplicationContextRunner withAdmin = contextRunner
            .withPropertyValues("sino.admin.email= Admin@Example.com ", "sino.admin.password=staple admin battery");

    @Test
    void theOwnerSignsInAsOwnerAndTheAdminAsAdmin() {
        withAdmin.run(context -> {
            UserDetailsService users = context.getBean(UserDetailsService.class);

            UserDetails owner = users.loadUserByUsername("owner@example.com");
            UserDetails admin = users.loadUserByUsername("  ADMIN@example.com ");

            assertThat(AuthorityUtils.authorityListToSet(owner.getAuthorities())).containsExactly("ROLE_OWNER");
            assertThat(admin.getUsername()).isEqualTo("admin@example.com");
            assertThat(AuthorityUtils.authorityListToSet(admin.getAuthorities())).containsExactly("ROLE_ADMIN");
            assertThat(admin.getPassword()).isEqualTo(context.getBean(LoginSettings.class).adminPasswordHash());
        });
    }

    @Test
    void withoutAnAdminItsEmailIsUnknown() {
        contextRunner.run(context -> assertThatThrownBy(
                () -> context.getBean(UserDetailsService.class).loadUserByUsername("admin@example.com"))
                .isInstanceOf(UsernameNotFoundException.class));
    }

    @Test
    void anyOtherEmailIsUnknown() {
        withAdmin.run(context -> assertThatThrownBy(
                () -> context.getBean(UserDetailsService.class).loadUserByUsername("someone@example.com"))
                .isInstanceOf(UsernameNotFoundException.class));
    }

    @Test
    void theOwnerGetsTheRememberMeCookie() {
        withAdmin.run(context -> {
            MockHttpServletResponse response = new MockHttpServletResponse();

            context.getBean(RememberMeServices.class).loginSuccess(new MockHttpServletRequest(), response,
                    signedIn("owner@example.com", "ROLE_OWNER"));

            assertThat(response.getCookie("remember-me")).isNotNull();
        });
    }

    @Test
    void theAdminNeverGetsTheRememberMeCookie() {
        withAdmin.run(context -> {
            MockHttpServletResponse response = new MockHttpServletResponse();

            context.getBean(RememberMeServices.class).loginSuccess(new MockHttpServletRequest(), response,
                    signedIn("admin@example.com", "ROLE_ADMIN"));

            assertThat(response.getCookie("remember-me")).isNull();
        });
    }

    @Test
    void aRememberMeCookieInTheAdminsNameSignsNobodyIn() {
        withAdmin.run(context -> {
            long expiry = Instant.now().plus(1, ChronoUnit.DAYS).toEpochMilli();
            String token = Base64.getEncoder()
                    .encodeToString(("admin@example.com:" + expiry + ":SHA256:00ff").getBytes(UTF_8));
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(new Cookie("remember-me", token));

            Authentication signedIn = context.getBean(RememberMeServices.class).autoLogin(request,
                    new MockHttpServletResponse());

            assertThat(signedIn).isNull();
        });
    }

    private static Authentication signedIn(String email, String role) {
        List<GrantedAuthority> authorities = AuthorityUtils.createAuthorityList(role);
        return UsernamePasswordAuthenticationToken.authenticated(email, null, authorities);
    }

}
