package dev.sino.common.security;

import jakarta.servlet.DispatcherType;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authorization.AuthenticatedAuthorizationManager;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationManagers;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.RememberMeServices;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * Browser sign-in with a session cookie (D-22 A): {@code POST /api/auth/login} (identity module) starts the session,
 * {@code POST /api/auth/logout} ends it. Uses Spring Security interfaces only, so {@code common} depends on no
 * business module; the user store and the remember-me services come from the identity module. The owner and the
 * admin sign in the same way but each reaches only its own API (D-263). A provider's notices of changes
 * ({@code POST /api/webhooks/*}) have a chain of their own.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

    private static final String ADMIN = "ADMIN";

    /**
     * A provider's notices of changes come from the provider, with no session, cookie or CSRF token (F07, D-76): no
     * sign-in is asked, no session or cookie is made, and the webhook itself checks the provider's own token and does
     * nothing without it. Only {@code POST} on one path segment under {@code /api/webhooks/}: anything else there
     * goes through the browser chain.
     */
    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    SecurityFilterChain webhookSecurityFilterChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher(PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/webhooks/*"))
                .authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .build();
    }

    @Bean
    SecurityFilterChain apiSecurityFilterChain(HttpSecurity http,
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver handlerExceptionResolver,
            RememberMeServices rememberMeServices) throws Exception {
        SecurityProblemHandler problemHandler = new SecurityProblemHandler(handlerExceptionResolver);
        return http
                .authorizeHttpRequests(requests -> requests
                        // Let error responses through instead of turning them into 401/403, and the dispatch that ends
                        // an event stream (F08), checked when the stream began, even if the session ended meanwhile.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/me").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        // The provider sends the browser back here; the pending connect in the session identifies
                        // the user, and without one the callback does nothing (F04a).
                        .requestMatchers(HttpMethod.GET, "/api/accounts/connect/*/callback").permitAll()
                        // Other actuator endpoints need a signed-in user; unexposed ones then answer 404.
                        .requestMatchers("/actuator/**").authenticated()
                        // The admin and the owner are kept apart (D-263): the admin reaches its own API only, and
                        // every other caller (the owner, D-02 A) everything else. Roles are named by identity.
                        .requestMatchers("/api/admin/**").hasRole(ADMIN)
                        .requestMatchers("/api/**").access(AuthorizationManagers.allOf(
                                AuthenticatedAuthorizationManager.authenticated(),
                                AuthorizationManagers.not(AuthorityAuthorizationManager.hasRole(ADMIN))))
                        .anyRequest().denyAll())
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(problemHandler)
                        .accessDeniedHandler(problemHandler))
                // The session cookie goes with every request, so changes need a CSRF token: the XSRF-TOKEN cookie,
                // readable by JavaScript, sent back in the X-XSRF-TOKEN header.
                .csrf(csrf -> csrf.spa())
                .rememberMe(rememberMe -> rememberMe.rememberMeServices(rememberMeServices))
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .build();
    }

}
