package dev.sino.conversation.application;

import java.util.Locale;

/**
 * The views of the inbox (F05 design, section 4; mail folders, D-500); scheduled and snoozed stay empty until those
 * features. A conversation is in the inbox unless it is archived in Sino, or all its mail sits in Gmail's archive or
 * spam and trash.
 */
public enum InboxView {

    ALL(Sql.INBOX),
    UNREAD(Sql.INBOX + " AND c.unread_count > 0"),
    REPLY(Sql.INBOX + " AND c.needs_reply"),
    ATTACHMENTS(Sql.INBOX + " AND c.has_attachments"),
    ARCHIVED("(c.archived OR (c.has_archive AND NOT c.has_inbox))"
            + " AND (c.has_inbox OR c.has_archive OR NOT c.has_junk)"),
    SENT("c.has_sent"),
    TRASH("c.has_junk"),
    SCHEDULED(null),
    SNOOZED(null);

    /** Plain constants of the conditions; an enum constant cannot name a static field of its own enum. */
    private static final class Sql {
        static final String INBOX = "NOT c.archived AND (c.has_inbox OR NOT (c.has_archive OR c.has_junk))";
    }

    /** What the API accepts as {@code view}, the names in lower case. */
    public static final String PARAMETER_VALUES = "all|unread|reply|attachments|archived|sent|trash|scheduled|snoozed";

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
