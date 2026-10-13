package dev.sino.account.application;

import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;

/**
 * What one account can do (F10, D-130): what its connector can, less sending while the account has not granted every
 * scope the connector sends with. Which scopes those are is the connector's to say
 * ({@link OAuth2Connection#sendScopes}), so this module never names a scope of a provider. An account whose provider
 * has no connector any more can do nothing.
 */
@Service
@Transactional(readOnly = true)
public class AccountCapabilities {

    private final ProviderRegistry providers;
    private final CredentialStore credentials;

    AccountCapabilities(ProviderRegistry providers, CredentialStore credentials) {
        this.providers = providers;
        this.credentials = credentials;
    }

    public ProviderCapabilities of(UUID accountId, ProviderType provider) {
        Optional<MessageProvider> connector = providers.find(provider);
        if (connector.isEmpty()) {
            return ProviderCapabilities.of();
        }
        ProviderCapabilities capabilities = connector.get().capabilities();
        Set<String> sendScopes = connector.get().oauth2().map(OAuth2Connection::sendScopes).orElse(Set.of());
        if (!capabilities.supports(ProviderCapability.SEND_MESSAGES) || sendScopes.isEmpty()
                || credentials.grantedScopes(accountId).containsAll(sendScopes)) {
            return capabilities;
        }
        EnumSet<ProviderCapability> withoutSending = EnumSet.noneOf(ProviderCapability.class);
        withoutSending.addAll(capabilities.values());
        withoutSending.remove(ProviderCapability.SEND_MESSAGES);
        return new ProviderCapabilities(withoutSending);
    }

}
