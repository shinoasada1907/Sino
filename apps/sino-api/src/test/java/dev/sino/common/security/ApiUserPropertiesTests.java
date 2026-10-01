package dev.sino.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class ApiUserPropertiesTests {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfig.class);

    @Test
    void failsToStartWhenTheApiUserIsMissing() {
        contextRunner
                .withPropertyValues("sino.security.api-user.username=", "sino.security.api-user.password=")
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("sino.security.api-user")
                        .hasStackTraceContaining("password"));
    }

    @Test
    void bindsTheApiUser() {
        contextRunner
                .withPropertyValues("sino.security.api-user.username=alice", "sino.security.api-user.password=s3cret")
                .run(context -> assertThat(context.getBean(ApiUserProperties.class).username()).isEqualTo("alice"));
    }

    @Test
    void neverPrintsThePassword() {
        assertThat(new ApiUserProperties("alice", "s3cret").toString()).contains("alice").doesNotContain("s3cret");
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ApiUserProperties.class)
    static class PropertiesConfig {
    }

}
