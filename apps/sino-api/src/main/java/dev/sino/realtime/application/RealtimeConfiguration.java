package dev.sino.realtime.application;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(RealtimeProperties.class)
class RealtimeConfiguration {
}
