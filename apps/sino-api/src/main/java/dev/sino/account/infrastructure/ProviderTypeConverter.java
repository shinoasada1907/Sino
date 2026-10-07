package dev.sino.account.infrastructure;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import dev.sino.provider.ProviderType;

/**
 * Stores a {@link ProviderType} as its text value, for example {@code gmail}. Applied automatically to every
 * {@code ProviderType} field, so the domain class does not have to name it.
 */
@Converter(autoApply = true)
public class ProviderTypeConverter implements AttributeConverter<ProviderType, String> {

    @Override
    public String convertToDatabaseColumn(ProviderType type) {
        return type == null ? null : type.value();
    }

    @Override
    public ProviderType convertToEntityAttribute(String value) {
        return value == null ? null : ProviderType.of(value);
    }

}
