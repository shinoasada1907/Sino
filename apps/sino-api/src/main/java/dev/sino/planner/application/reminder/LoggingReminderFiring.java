package dev.sino.planner.application.reminder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Stand-in until RM-03: only says that a reminder came due. */
@Component
class LoggingReminderFiring implements ReminderFiring {

    private static final Logger log = LoggerFactory.getLogger(LoggingReminderFiring.class);

    @Override
    public void fire(ReminderDue due) {
        log.info("Reminder due: {} {} occurrence {} at {}", due.kind(), due.itemId(), due.occurrenceDate(),
                due.remindAt());
    }

}
