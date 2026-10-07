package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class OwnerPropertiesTests {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfig.class);

    @Test
    void failsToStartWithoutTheOwnerEmail() {
        contextRunner
                .withPropertyValues("sino.owner.email=", "sino.owner.display-name=Owner")
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("sino.owner")
                        .hasStackTraceContaining("email"));
    }

    @Test
    void failsToStartWithoutADisplayName() {
        contextRunner
                .withPropertyValues("sino.owner.email=owner@example.com", "sino.owner.display-name=")
                .run(context -> assertThat(context).getFailure().hasStackTraceContaining("displayName"));
    }

    @Test
    void failsToStartWithAnInvalidEmail() {
        contextRunner
                .withPropertyValues("sino.owner.email=not-an-email", "sino.owner.display-name=Owner")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void bindsTheOwner() {
        contextRunner
                .withPropertyValues("sino.owner.email=owner@example.com", "sino.owner.display-name=Owner")
                .run(context -> assertThat(context.getBean(OwnerProperties.class))
                        .isEqualTo(new OwnerProperties("owner@example.com", "Owner", null)));
    }

    @Test
    void trimsAndLowerCasesTheEmail() {
        OwnerProperties owner = new OwnerProperties("  Owner@Example.COM ", " Owner ", null);

        assertThat(owner.email()).isEqualTo("owner@example.com");
        assertThat(owner.displayName()).isEqualTo("Owner");
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(OwnerProperties.class)
    static class PropertiesConfig {
    }

}
