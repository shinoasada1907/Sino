package dev.sino.planner.domain;

import java.time.Instant;
import java.time.LocalDate;

/** One time a reminder fires: the date of the occurrence it is for (its key, D-524) and the moment it fires. */
public record ReminderOccurrence(LocalDate date, Instant at) {
}
