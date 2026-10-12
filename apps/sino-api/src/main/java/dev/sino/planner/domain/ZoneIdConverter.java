package dev.sino.planner.domain;

import java.time.ZoneId;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores a time zone as its IANA name, for example {@code Asia/Ho_Chi_Minh}. */
@Converter
public class ZoneIdConverter implements AttributeConverter<ZoneId, String> {

    @Override
    public String convertToDatabaseColumn(ZoneId zone) {
        return zone == null ? null : zone.getId();
    }

    @Override
    public ZoneId convertToEntityAttribute(String value) {
        return value == null ? null : ZoneId.of(value);
    }

}
