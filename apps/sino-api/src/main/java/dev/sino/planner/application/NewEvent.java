package dev.sino.planner.application;

import dev.sino.planner.domain.EventTime;

/** An appointment to save, new or replacing one: a title and a time, and maybe a place, notes and a repeat rule. */
public record NewEvent(String title, String location, String notes, EventTime time, RepeatRule repeat) {
}
