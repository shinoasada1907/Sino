package dev.sino.sticker.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores a {@link StickerMediaType} as the text a browser knows ({@code image/png}), not as the name of the constant. */
@Converter
public final class StickerMediaTypeConverter implements AttributeConverter<StickerMediaType, String> {

    @Override
    public String convertToDatabaseColumn(StickerMediaType type) {
        return type == null ? null : type.value();
    }

    @Override
    public StickerMediaType convertToEntityAttribute(String value) {
        return value == null ? null : StickerMediaType.of(value);
    }

}
