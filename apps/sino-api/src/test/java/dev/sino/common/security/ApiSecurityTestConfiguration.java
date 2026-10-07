package dev.sino.common.security;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.web.authentication.NullRememberMeServices;
import org.springframework.security.web.authentication.RememberMeServices;

/**
 * Lets web slice tests in other packages load the real API security setup without making {@link SecurityConfig}
 * public. Slices sign in with {@code with(user(...))} and do not load the identity module, so remember-me is a no-op
 * here; {@code AuthApiTests} covers the real one.
 */
@TestConfiguration(proxyBeanMethods = false)
@Import(SecurityConfig.class)
public class ApiSecurityTestConfiguration {

    @Bean
    RememberMeServices rememberMeServices() {
        return new NullRememberMeServices();
    }

}
