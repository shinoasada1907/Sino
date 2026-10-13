package dev.sino.planner.application;

import java.time.ZoneId;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Tasks and the calendar, under {@code sino.planner} (D-157): the time zone of the user's days. "Today", the days of a
 * calendar range and new repeat rules use it; a repeat rule keeps the zone it was made in. An unknown zone name stops
 * the application. Moves to the user's profile once Sino has one.
 */
@ConfigurationProperties("sino.planner")
public record PlannerProperties(ZoneId timeZone) {

    public PlannerProperties {
        timeZone = timeZone == null ? ZoneId.of("Asia/Ho_Chi_Minh") : timeZone;
    }

}
