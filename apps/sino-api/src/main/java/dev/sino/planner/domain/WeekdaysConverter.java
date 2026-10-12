package dev.sino.planner.domain;

import java.time.DayOfWeek;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Stores the weekdays of a weekly rule as their names, Monday first, for example {@code MONDAY,THURSDAY}. No weekdays
 * is no value, so a row without a rule keeps every {@code rec_*} column empty.
 */
@Converter
public class WeekdaysConverter implements AttributeConverter<Set<DayOfWeek>, String> {

    @Override
    public String convertToDatabaseColumn(Set<DayOfWeek> days) {
        if (days == null || days.isEmpty()) {
            return null;
        }
        return EnumSet.copyOf(days).stream().map(DayOfWeek::name).collect(Collectors.joining(","));
    }

    @Override
    public Set<DayOfWeek> convertToEntityAttribute(String value) {
        if (value == null) {
            return null;
        }
        return Arrays.stream(value.split(",")).map(DayOfWeek::valueOf)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(DayOfWeek.class)));
    }

}
