package dev.sino.provider.api;

import java.util.List;

import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderDescriptor;

/**
 * One provider in {@code GET /api/providers}. Kind, capabilities and the connect method are their UPPER_SNAKE_CASE
 * names; {@code connectMethod} is {@code null} for a provider that cannot be connected (D-285).
 */
record ProviderResponse(String type, String displayName, String kind, List<String> capabilities,
        String connectMethod, boolean connectable) {

    static ProviderResponse from(ProviderDescriptor descriptor) {
        List<String> capabilities = descriptor.capabilities().values().stream()
                .map(ProviderCapability::name)
                .toList();
        return new ProviderResponse(descriptor.type().value(), descriptor.displayName(), descriptor.kind().name(),
                capabilities, descriptor.connectMethod() == null ? null : descriptor.connectMethod().name(),
                descriptor.connectable());
    }

}
