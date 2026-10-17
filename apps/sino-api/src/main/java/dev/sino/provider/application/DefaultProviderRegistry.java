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
import dev.sino.provider.ConnectMethod;
import dev.sino.provider.ProviderDescriptor;
import dev.sino.provider.ProviderKind;
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
            ProviderKind kind = Objects.requireNonNull(provider.kind(),
                    () -> provider.getClass().getName() + " returned no provider kind");
            MessageProvider previous = byType.putIfAbsent(type, provider);
            if (previous != null) {
                throw new IllegalStateException("Duplicate provider type '" + type + "': "
                        + previous.getClass().getName() + " and " + provider.getClass().getName());
            }
            ConnectMethod connectMethod = connectMethodOf(provider);
            found.add(new ProviderDescriptor(type, provider.displayName(), kind, provider.capabilities(),
                    connectMethod, connectMethod != null && provider.turnedOn()));
        }
        found.sort(Comparator.comparing(descriptor -> descriptor.type().value()));
        this.providers = Map.copyOf(byType);
        this.descriptors = List.copyOf(found);
    }

    // One way per connector: the web would not know which step to show, and the account module which flow to run.
    private static ConnectMethod connectMethodOf(MessageProvider provider) {
        boolean oauth2 = provider.oauth2().isPresent();
        boolean qr = provider.qrLogin().isPresent();
        if (oauth2 && qr) {
            throw new IllegalStateException(provider.getClass().getName()
                    + " connects both over OAuth2 and by QR code: a connector has one way to connect");
        }
        return oauth2 ? ConnectMethod.OAUTH2 : qr ? ConnectMethod.QR : null;
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
