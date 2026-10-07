package dev.sino.provider.api;

import java.util.List;

import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderDescriptor;

/**
 * One provider in {@code GET /api/providers}. Capabilities are their UPPER_SNAKE_CASE names.
 */
record ProviderResponse(String type, String displayName, List<String> capabilities) {

    static ProviderResponse from(ProviderDescriptor descriptor) {
        List<String> capabilities = descriptor.capabilities().values().stream()
                .map(ProviderCapability::name)
                .toList();
        return new ProviderResponse(descriptor.type().value(), descriptor.displayName(), capabilities);
    }

}
