package dev.sino.planner.domain;

import java.time.LocalDate;

/**
 * One occurrence of a repeat rule: its date and its place in the series, the first one being 0.
 */
public record Occurrence(int index, LocalDate date) {
}
