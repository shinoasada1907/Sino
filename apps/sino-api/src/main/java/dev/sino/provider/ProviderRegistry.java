package dev.sino.provider;

import java.util.List;
import java.util.Optional;

import dev.sino.provider.spi.MessageProvider;

/**
 * The one place that resolves a connector by its {@link ProviderType}. Built once at startup from every
 * {@link MessageProvider} bean; two connectors with the same type stop the application from starting.
 */
public interface ProviderRegistry {

    /**
     * The connector for {@code type}.
     *
     * @throws dev.sino.common.error.SinoException with {@link ProviderRegistryErrorCode#UNKNOWN_PROVIDER}
     *         when no connector has this type
     */
    MessageProvider get(ProviderType type);

    /** Like {@link #get(ProviderType)}, but empty instead of throwing. */
    Optional<MessageProvider> find(ProviderType type);

    boolean isSupported(ProviderType type);

    /** One descriptor per connector, sorted by type. */
    List<ProviderDescriptor> descriptors();

}
