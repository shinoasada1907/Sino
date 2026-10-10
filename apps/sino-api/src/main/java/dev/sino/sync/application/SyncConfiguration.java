package dev.sino.sync.application;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

// Scheduling is on for the whole application; whether automatic sync runs is LiveSyncSchedule's switch.
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties({ InitialSyncProperties.class, LiveSyncProperties.class })
class SyncConfiguration {
}
