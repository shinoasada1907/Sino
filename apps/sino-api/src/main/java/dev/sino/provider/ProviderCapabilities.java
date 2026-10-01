package dev.sino.provider;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

/**
 * The capabilities one provider supports. Immutable: the set is copied on creation and cannot be changed
 * afterwards. Iteration follows the declaration order of {@link ProviderCapability}.
 */
public record ProviderCapabilities(Set<ProviderCapability> values) {

    public ProviderCapabilities {
        Objects.requireNonNull(values, "values must not be null");
        // EnumSet.copyOf would throw on an empty collection that is not an EnumSet.
        EnumSet<ProviderCapability> copy = EnumSet.noneOf(ProviderCapability.class);
        copy.addAll(values);
        values = Collections.unmodifiableSet(copy);
    }

    public static ProviderCapabilities of(ProviderCapability... capabilities) {
        EnumSet<ProviderCapability> set = EnumSet.noneOf(ProviderCapability.class);
        Collections.addAll(set, capabilities);
        return new ProviderCapabilities(set);
    }

    public boolean supports(ProviderCapability capability) {
        return values.contains(capability);
    }

    public void require(ProviderCapability capability) {
        if (!supports(capability)) {
            // Replaced by ProviderException(CAPABILITY_NOT_SUPPORTED) in BE-22.
            throw new UnsupportedOperationException("Provider does not support " + capability);
        }
    }

}
