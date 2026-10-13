package dev.sino.account.infrastructure.oauth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code sino.public-base-url}: the address the browser uses to reach Sino, for example
 * {@code http://localhost:5173} in development (D-36). The connect flow builds its redirect URI from it.
 */
@ConfigurationProperties("sino")
public record ConnectProperties(String publicBaseUrl) {
}
