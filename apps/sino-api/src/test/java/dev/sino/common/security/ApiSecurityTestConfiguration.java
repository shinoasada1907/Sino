package dev.sino.common.security;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

/**
 * Lets web slice tests in other packages load the real API security setup without making {@link SecurityConfig}
 * public.
 */
@TestConfiguration(proxyBeanMethods = false)
@Import(SecurityConfig.class)
public class ApiSecurityTestConfiguration {
}
