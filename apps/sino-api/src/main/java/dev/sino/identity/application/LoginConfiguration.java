package dev.sino.identity.application;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Beans of browser sign-in (D-22) that the identity module owns.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({ OwnerProperties.class, AuthProperties.class })
class LoginConfiguration {

    /**
     * Encodes new hashes with BCrypt ({@code {bcrypt}...}) and still reads the {@code {noop}} password of the HTTP
     * Basic user until BE-28 removes it.
     */
    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

}
