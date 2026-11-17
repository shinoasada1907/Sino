package dev.sino.conversation.application;

import java.util.Locale;

/**
 * Whether the list keeps 1-1 chats or groups (D-426). An email thread is neither, so it never matches.
 */
public enum ChatType {

    DIRECT("c.type = 'DIRECT'"),
    GROUP("c.type IN ('GROUP', 'CHANNEL')");

    /** What the API accepts as {@code chatType}, in lower case. */
    public static final String PARAMETER_VALUES = "direct|group";

    // A constant of this enum, never anything the caller sent.
    private final String condition;

    ChatType(String condition) {
        this.condition = condition;
    }

    /** @throws IllegalArgumentException when the value is not one of {@link #PARAMETER_VALUES} */
    public static ChatType of(String parameter) {
        return valueOf(parameter.toUpperCase(Locale.ROOT));
    }

    String condition() {
        return condition;
    }
}
