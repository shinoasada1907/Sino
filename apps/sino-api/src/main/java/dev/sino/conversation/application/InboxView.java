package dev.sino.conversation.application;

import java.util.Locale;

/** The views of the inbox (F05 design, section 4); scheduled and snoozed stay empty until those features. */
public enum InboxView {

    ALL("NOT c.archived"),
    UNREAD("NOT c.archived AND c.unread_count > 0"),
    REPLY("NOT c.archived AND c.needs_reply"),
    ATTACHMENTS("NOT c.archived AND c.has_attachments"),
    ARCHIVED("c.archived"),
    SCHEDULED(null),
    SNOOZED(null);

    /** What the API accepts as {@code view}, the names in lower case. */
    public static final String PARAMETER_VALUES = "all|unread|reply|attachments|archived|scheduled|snoozed";

    // A constant of this enum, never anything the caller sent.
    private final String condition;

    InboxView(String condition) {
        this.condition = condition;
    }

    /** @throws IllegalArgumentException when the value is not one of {@link #PARAMETER_VALUES} */
    public static InboxView of(String parameter) {
        return valueOf(parameter.toUpperCase(Locale.ROOT));
    }

    String condition() {
        return condition;
    }

    boolean alwaysEmpty() {
        return condition == null;
    }

}
