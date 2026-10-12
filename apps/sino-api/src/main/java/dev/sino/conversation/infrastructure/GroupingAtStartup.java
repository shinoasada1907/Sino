package dev.sino.conversation.infrastructure;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Groups the mail stored before groups existed when Sino starts (F05b, D-180). Groups only decide how the inbox shows
 * a thread, so a failure is logged and Sino starts without them; the next stores group what they touch.
 */
@Component
class GroupingAtStartup {

    private static final Logger log = LoggerFactory.getLogger(GroupingAtStartup.class);

    private final ThreadGroups groups;

    GroupingAtStartup(ThreadGroups groups) {
        this.groups = groups;
    }

    @EventListener(ApplicationReadyEvent.class)
    void groupAll() {
        try {
            groups.groupAll();
        } catch (RuntimeException failure) {
            log.warn("The conversations stored before groups existed were not grouped", failure);
        }
    }

}
