package dev.sino.identity.application;

import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
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
 * Beans of browser sign-in (D-22) that the identity module owns: the owner as the only user, the authentication
 * manager the sign-in endpoint calls, and the remember-me services ({@code common}'s security configuration uses
 * them through their Spring Security interfaces).
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({ OwnerProperties.class, AuthProperties.class })
class LoginConfiguration {

    static final Duration REMEMBER_ME_VALIDITY = Duration.ofDays(30);

    /** Encodes with BCrypt; the {@code {bcrypt}} prefix names the algorithm of each stored hash. */
    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /** The owner is the only user (D-33); any other email is unknown. */
    @Bean
    UserDetailsService ownerUserDetailsService(LoginSettings settings) {
        return email -> owner(settings, email, settings.passwordHash());
    }

    /**
     * Compares the password with the BCrypt hash. For an unknown email it still checks a dummy hash, so both
     * failures take the same time and give the same {@code BadCredentialsException}.
     */
    @Bean
    AuthenticationManager authenticationManager(UserDetailsService ownerUserDetailsService,
            PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(ownerUserDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }

    /**
     * "Keep me signed in" (D-34): an HttpOnly cookie valid for 30 days, signed with SHA-256 over the email, the
     * expiry, {@link LoginSettings#rememberMeFingerprint()} and the remember-me key.
     */
    @Bean
    RememberMeServices rememberMeServices(LoginSettings settings) {
        TokenBasedRememberMeServices services = new TokenBasedRememberMeServices(settings.rememberMeKey(),
                email -> owner(settings, email, settings.rememberMeFingerprint()), RememberMeTokenAlgorithm.SHA256);
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
        return User.withUsername(settings.ownerEmail()).password(password).roles("OWNER").build();
    }

}
