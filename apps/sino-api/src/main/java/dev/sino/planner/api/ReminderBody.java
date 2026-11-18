package dev.sino.planner.api;

import tools.jackson.databind.JsonNode;

import dev.sino.planner.domain.Reminder;

/**
 * Reads {@code reminder: {"offsetMinutes": n}} of a request body (D-523). The field is kept as a {@link JsonNode}
 * because three cases differ: left out ({@code null} here), {@code "reminder": null} (a {@code NullNode}: none) and an
 * object. Which offsets are allowed depends on the kind of time, so each request checks it with
 * {@link #isAllowed} ({@code reminderAllowed}).
 */
final class ReminderBody {

    private ReminderBody() {
    }

    /** Whether the reminder is left out of the body, which a new appointment answers with the settings' default. */
    static boolean isLeftOut(JsonNode node) {
        return node == null;
    }

    /**
     * Whether the field is fine: left out, null, or an object with an {@code offsetMinutes} integer that is allowed
     * for a whole day ({@code wholeDay} true) or a timed start.
     */
    static boolean isAllowed(JsonNode node, boolean wholeDay) {
        if (node == null || node.isNull()) {
            return true;
        }
        JsonNode offset = node.isObject() ? node.get("offsetMinutes") : null;
        return offset != null && offset.isInt() && Reminder.isAllowed(offset.intValue(), wholeDay);
    }

    /** The reminder of the field, {@code null} when it is left out or null; call only once {@link #isAllowed} holds. */
    static Reminder reminderOf(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new Reminder(node.get("offsetMinutes").intValue());
    }

}
