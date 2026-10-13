package dev.sino.identity.application;

import java.time.Duration;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.RememberMeServices;
import org.springframework.security.web.authentication.rememberme.TokenBasedRememberMeServices;
import org.springframework.security.web.authentication.rememberme.TokenBasedRememberMeServices.RememberMeTokenAlgorithm;

/**
 * Beans of browser sign-in (D-22) that the identity module owns: who may sign in (the owner, and the admin when
 * configured), the authentication manager the sign-in endpoint calls, and the remember-me services ({@code common}'s
 * security configuration uses them through their Spring Security interfaces).
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({ OwnerProperties.class, AuthProperties.class, AdminProperties.class })
class LoginConfiguration {

    static final Duration REMEMBER_ME_VALIDITY = Duration.ofDays(30);

    /** Role of the owner. {@code common}'s security configuration names the same roles. */
    static final String OWNER = "OWNER";

    /** Role of the admin (D-260): {@code /api/admin/**} only, never the owner's API (D-263). */
    static final String ADMIN = "ADMIN";

    /** Encodes with BCrypt; the {@code {bcrypt}} prefix names the algorithm of each stored hash. */
    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /** The owner (D-33) and, when configured, the admin (D-262); any other email is unknown. */
    @Bean
    UserDetailsService userDetailsService(LoginSettings settings) {
        return email -> {
            String normalized = OwnerProperties.normalizeEmail(email);
            if (settings.adminEmail().filter(admin -> admin.equals(normalized)).isPresent()) {
                return User.withUsername(normalized).password(settings.adminPasswordHash()).roles(ADMIN).build();
            }
            return owner(settings, email, settings.passwordHash());
        };
    }

    /**
     * Compares the password with the BCrypt hash. For an unknown email it still checks a dummy hash, so both
     * failures take the same time and give the same {@code BadCredentialsException}.
     */
    @Bean
    AuthenticationManager authenticationManager(UserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }

    /**
     * "Keep me signed in" (D-34), for the owner only: an HttpOnly cookie valid for 30 days, signed with SHA-256 over
     * the email, the expiry, {@link LoginSettings#rememberMeFingerprint()} and the remember-me key. It knows the
     * owner alone, so a cookie in any other name signs nobody in.
     */
    @Bean
    RememberMeServices rememberMeServices(LoginSettings settings) {
        TokenBasedRememberMeServices services = new OwnerRememberMeServices(settings.rememberMeKey(),
                email -> owner(settings, email, settings.rememberMeFingerprint()));
        services.setTokenValiditySeconds((int) REMEMBER_ME_VALIDITY.toSeconds());
        // The sign-in body is JSON, not a form, so the endpoint decides and only calls loginSuccess when asked.
        services.setAlwaysRemember(true);
        services.setCookieCustomizer(cookie -> cookie.setAttribute("SameSite", "Lax"));
        return services;
    }

    private static UserDetails owner(LoginSettings settings, String email, String password) {
        if (!settings.ownerEmail().equals(OwnerProperties.normalizeEmail(email))) {
            throw new UsernameNotFoundException("Unknown user");
        }
        return User.withUsername(settings.ownerEmail()).password(password).roles(OWNER).build();
    }

    /**
     * Gives the cookie to the owner only: the admin never gets one, even when it asks (D-262), so a lost cookie can
     * never open the admin API for a month.
     */
    private static final class OwnerRememberMeServices extends TokenBasedRememberMeServices {

        private static final String OWNER_AUTHORITY = "ROLE_" + OWNER;

        OwnerRememberMeServices(String key, UserDetailsService owner) {
            super(key, owner, RememberMeTokenAlgorithm.SHA256);
        }

        @Override
        public void onLoginSuccess(HttpServletRequest request, HttpServletResponse response,
                Authentication successfulAuthentication) {
            boolean owner = successfulAuthentication.getAuthorities().stream()
                    .anyMatch(authority -> OWNER_AUTHORITY.equals(authority.getAuthority()));
            if (owner) {
                super.onLoginSuccess(request, response, successfulAuthentication);
            }
        }

    }

}
