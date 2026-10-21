package dev.sino.settings.domain;

/** The six notification switches of the Cài đặt screen (D-401). Every switch is on by default but importantOnly. */
public record Notifications(boolean newMessages, boolean importantOnly, boolean syncErrors, boolean newRegistrations,
        boolean reminders, boolean scheduledFailed) {

    public static final Notifications DEFAULTS = new Notifications(true, false, true, true, true, true);

}
