package dev.sino.account.application;

import java.time.Clock;
import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.oauth.OAuth2Clients;
import dev.sino.common.error.SinoException;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderRegistryErrorCode;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;

/**
 * Connects an account over OAuth2 (F04a): a new one, or a reconnect of one whose authorization ran out. Knows
 * nothing of HTTP; the web layer keeps the {@link PendingConnect} in the browser session until the provider answers.
 */
@Service
public class ConnectService {

    private final ProviderRegistry providers;
    private final AccountQueryService accounts;
    private final OAuth2Clients clients;
    private final Clock clock;

    ConnectService(ProviderRegistry providers, AccountQueryService accounts, OAuth2Clients clients, Clock clock) {
        this.providers = providers;
        this.accounts = accounts;
        this.clients = clients;
        this.clock = clock;
    }

    /**
     * When reconnecting, the provider is asked for the same account ({@code login_hint} = its external ID, which
     * for Google is the {@code sub} it accepts there).
     *
     * @param accountId the account to reconnect, or {@code null} for a new one
     * @throws SinoException with {@link ProviderRegistryErrorCode#UNKNOWN_PROVIDER},
     *         {@link AccountErrorCode#CONNECT_NOT_SUPPORTED}, or {@link AccountErrorCode#ACCOUNT_NOT_FOUND} when the
     *         account is not the owner's, is removed, or belongs to another provider
     */
    public PendingConnect start(UUID ownerId, String provider, UUID accountId) {
        MessageProvider connector = providers.get(typeOf(provider));
        OAuth2Connection connection = connector.oauth2().orElseThrow(() -> new SinoException(
                AccountErrorCode.CONNECT_NOT_SUPPORTED, connector.displayName() + " cannot be connected this way."));
        String loginHint = null;
        if (accountId != null) {
            ConnectedAccount account = accounts.get(ownerId, accountId);
            if (!account.provider().equals(connector.type())) {
                throw AccountErrorCode.accountNotFound();
            }
            loginHint = account.externalAccountId();
        }
        return new PendingConnect(connector.type().value(), ownerId, accountId,
                clients.authorizationRequest(connector.type(), connection, loginHint), clock.instant());
    }

    // A name that cannot be a provider type is simply an unknown provider.
    private static ProviderType typeOf(String provider) {
        try {
            return ProviderType.of(provider);
        } catch (IllegalArgumentException e) {
            throw new SinoException(ProviderRegistryErrorCode.UNKNOWN_PROVIDER, "Unknown provider type.");
        }
    }

}
