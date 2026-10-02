package dev.sino.provider.application;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.stereotype.Component;

import dev.sino.common.error.SinoException;
import dev.sino.provider.ProviderDescriptor;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderRegistryErrorCode;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;

/**
 * {@link ProviderRegistry} built once from the connector beans. Nothing changes after construction, so it is
 * thread-safe.
 */
@Component
class DefaultProviderRegistry implements ProviderRegistry {

    private final Map<ProviderType, MessageProvider> providers;
    private final List<ProviderDescriptor> descriptors;

    // With a single constructor Spring passes an empty list when there is no connector bean.
    DefaultProviderRegistry(List<MessageProvider> providers) {
        Map<ProviderType, MessageProvider> byType = new HashMap<>();
        List<ProviderDescriptor> found = new ArrayList<>();
        for (MessageProvider provider : providers) {
            ProviderType type = Objects.requireNonNull(provider.type(),
                    () -> provider.getClass().getName() + " returned no provider type");
            MessageProvider previous = byType.putIfAbsent(type, provider);
            if (previous != null) {
                throw new IllegalStateException("Duplicate provider type '" + type + "': "
                        + previous.getClass().getName() + " and " + provider.getClass().getName());
            }
            found.add(new ProviderDescriptor(type, provider.displayName(), provider.capabilities()));
        }
        found.sort(Comparator.comparing(descriptor -> descriptor.type().value()));
        this.providers = Map.copyOf(byType);
        this.descriptors = List.copyOf(found);
    }

    @Override
    public MessageProvider get(ProviderType type) {
        return find(type).orElseThrow(() -> new SinoException(ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
                "Unknown provider type: " + type));
    }

    @Override
    public Optional<MessageProvider> find(ProviderType type) {
        Objects.requireNonNull(type, "type must not be null");
        return Optional.ofNullable(providers.get(type));
    }

    @Override
    public boolean isSupported(ProviderType type) {
        return find(type).isPresent();
    }

    @Override
    public List<ProviderDescriptor> descriptors() {
        return descriptors;
    }

}
