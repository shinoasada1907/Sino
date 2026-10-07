package dev.sino.provider;

import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * Identifies a provider, for example {@code gmail}. The value is trimmed and lower-cased before it is
 * checked. The set is open: a new provider adds a connector, not a constant here (D-16).
 */
public record ProviderType(String value) {

    private static final Pattern PATTERN = Pattern.compile("^[a-z][a-z0-9-]{1,31}$");

    public ProviderType {
        Objects.requireNonNull(value, "value must not be null");
        value = value.trim().toLowerCase(Locale.ROOT);
        if (!PATTERN.matcher(value).matches()) {
            throw new IllegalArgumentException("Invalid provider type: '" + value + "'");
        }
    }

    public static ProviderType of(String value) {
        return new ProviderType(value);
    }

    @Override
    public String toString() {
        return value;
    }

}
