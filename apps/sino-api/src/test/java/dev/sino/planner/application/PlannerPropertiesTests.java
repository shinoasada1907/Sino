package dev.sino.planner.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.ZoneId;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class PlannerPropertiesTests {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfig.class);

    @Test
    void theTimeZoneIsVietnamByDefault() {
        contextRunner.run(context -> assertThat(context.getBean(PlannerProperties.class).timeZone())
                .isEqualTo(ZoneId.of("Asia/Ho_Chi_Minh")));
    }

    @Test
    void bindsATimeZone() {
        contextRunner.withPropertyValues("sino.planner.time-zone=Europe/Berlin")
                .run(context -> assertThat(context.getBean(PlannerProperties.class).timeZone())
                        .isEqualTo(ZoneId.of("Europe/Berlin")));
    }

    @Test
    void anUnknownTimeZoneStopsTheApplication() {
        contextRunner.withPropertyValues("sino.planner.time-zone=Mars/Olympus_Mons")
                .run(context -> assertThat(context).getFailure().hasStackTraceContaining("sino.planner.time-zone"));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(PlannerProperties.class)
    static class PropertiesConfig {
    }

}
