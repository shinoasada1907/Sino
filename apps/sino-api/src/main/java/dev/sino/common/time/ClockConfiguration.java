package dev.sino.common.time;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The application clock, in UTC like the JVM (D-23). Code that needs the time asks this bean, so tests can move
 * time forward instead of waiting.
 */
@Configuration(proxyBeanMethods = false)
class ClockConfiguration {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

}
