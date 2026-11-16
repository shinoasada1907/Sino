package dev.sino.settings.domain;

/** The notification switches a change turns on or off (D-402); a {@code null} switch stays as it is. */
public record NotificationsChange(Boolean newMessages, Boolean importantOnly, Boolean syncErrors,
        Boolean newRegistrations, Boolean reminders, Boolean scheduledFailed) {

    public static final NotificationsChange NONE = new NotificationsChange(null, null, null, null, null, null);

    public boolean isEmpty() {
        return equals(NONE);
    }

    Notifications applyTo(Notifications current) {
        return new Notifications(
                newMessages != null ? newMessages : current.newMessages(),
                importantOnly != null ? importantOnly : current.importantOnly(),
                syncErrors != null ? syncErrors : current.syncErrors(),
                newRegistrations != null ? newRegistrations : current.newRegistrations(),
                reminders != null ? reminders : current.reminders(),
                scheduledFailed != null ? scheduledFailed : current.scheduledFailed());
    }

}
