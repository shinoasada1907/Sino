package dev.sino.planner.application.reminder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Runs {@link ReminderScheduler#catchUp} once when the application starts, and only where the job server runs (a
 * booked job with nobody to run it helps no one). A failure is logged and does not stop the application.
 */
@Component
@ConditionalOnProperty(name = "jobrunr.background-job-server.enabled", havingValue = "true")
class ReminderCatchUp implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ReminderCatchUp.class);

    private final ReminderScheduler scheduler;

    ReminderCatchUp(ReminderScheduler scheduler) {
        this.scheduler = scheduler;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int booked = scheduler.catchUp();
            log.info("Reminder sweep at start-up: {} job(s) booked", booked);
        } catch (RuntimeException e) {
            log.error("Reminder sweep at start-up failed", e);
        }
    }

}
