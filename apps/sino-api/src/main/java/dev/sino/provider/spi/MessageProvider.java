package dev.sino.provider.spi;

import java.util.Optional;

import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderType;

/**
 * What a provider connector implements. Callers check {@link #capabilities()} before calling an operation
 * (FR-06) and never call a connector inside a database transaction.
 */
public interface MessageProvider {

    ProviderType type();

    /** Name shown to users, for example {@code Gmail}; defaults to the type. */
    default String displayName() {
        return type().value();
    }

    /** Only what the connector really supports. */
    ProviderCapabilities capabilities();

    /** Who the connected account is; {@code externalAccountId} is stable between calls. */
    AccountProfile getAccountProfile(ProviderContext context);

    /** Changes after {@code cursor}; {@link SyncCursor#initial()} asks for the first sync. */
    SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor);

    /**
     * How the connector is connected over OAuth2, or empty when it is not (D-38). A connector never exchanges a
     * code or refreshes a token itself: the {@code account} module does (D-15 = A').
     */
    default Optional<OAuth2Connection> oauth2() {
        return Optional.empty();
    }

    /** Only for connectors that declare {@link ProviderCapability#SEND_MESSAGES}. */
    default SendMessageResult sendMessage(ProviderContext context, SendMessageCommand command) {
        throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                type() + " does not support " + ProviderCapability.SEND_MESSAGES);
    }

}
