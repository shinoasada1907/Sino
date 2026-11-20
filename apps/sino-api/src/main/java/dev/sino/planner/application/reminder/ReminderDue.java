package dev.sino.planner.application.reminder;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import dev.sino.planner.domain.ReminderKind;

/** A reminder that has come due: what it is for, whose it is, which occurrence and when it was due. */
public record ReminderDue(ReminderKind kind, UUID itemId, UUID ownerId, String title, LocalDate occurrenceDate,
        Instant remindAt) {
}
