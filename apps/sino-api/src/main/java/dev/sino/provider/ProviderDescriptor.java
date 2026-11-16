package dev.sino.provider;

import java.util.Objects;

/**
 * What callers may know about a supported provider: its type, the name shown to users, its kind and its capabilities,
 * how an account of it is connected ({@code null}: it cannot be), and whether it can be connected now: it has a way
 * and it is turned on (D-285, D-286). Holds no configuration and no secret of the connector.
 */
public record ProviderDescriptor(ProviderType type, String displayName, ProviderKind kind,
        ProviderCapabilities capabilities, ConnectMethod connectMethod, boolean connectable) {

    public ProviderDescriptor {
        Objects.requireNonNull(type, "type must not be null");
        Objects.requireNonNull(displayName, "displayName must not be null");
        Objects.requireNonNull(kind, "kind must not be null");
        Objects.requireNonNull(capabilities, "capabilities must not be null");
        if (displayName.isBlank()) {
            throw new IllegalArgumentException("displayName must not be blank");
        }
        if (connectable && connectMethod == null) {
            throw new IllegalArgumentException("only a provider with a connect method can be connectable");
        }
    }

}
