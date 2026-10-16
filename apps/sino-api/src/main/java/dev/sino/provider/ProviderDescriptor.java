package dev.sino.provider;

import java.util.Objects;

/**
 * What callers may know about a supported provider: its type, the name shown to users, its kind and its capabilities.
 * Holds no configuration and no secret of the connector.
 */
public record ProviderDescriptor(ProviderType type, String displayName, ProviderKind kind,
        ProviderCapabilities capabilities) {

    public ProviderDescriptor {
        Objects.requireNonNull(type, "type must not be null");
        Objects.requireNonNull(displayName, "displayName must not be null");
        Objects.requireNonNull(kind, "kind must not be null");
        Objects.requireNonNull(capabilities, "capabilities must not be null");
        if (displayName.isBlank()) {
            throw new IllegalArgumentException("displayName must not be blank");
        }
    }

}
