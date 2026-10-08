package dev.sino.account.application;

import java.time.Clock;
import java.util.UUID;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.oauth.OAuth2Clients;
import dev.sino.account.infrastructure.oauth.OAuth2ExchangeException;
import dev.sino.account.infrastructure.oauth.OAuth2TokenRevoker;
import dev.sino.account.infrastructure.oauth.OAuth2Tokens;
import dev.sino.common.error.SinoException;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderRegistryErrorCode;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Connection;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderException;

/**
 * Connects an account over OAuth2 (F04a): a new one, or a reconnect of one whose authorization ran out. Knows
 * nothing of HTTP; the web layer keeps the {@link PendingConnect} in the browser session until the provider answers.
 * Every call to the provider happens outside a transaction; only the final registration is one.
 */
@Service
public class ConnectService {

    private static final Logger LOG = LoggerFactory.getLogger(ConnectService.class);
    // An error the provider sends back through the browser is logged only when it looks like an OAuth error code.
    private static final Pattern ERROR_CODE = Pattern.compile("[A-Za-z0-9_.-]{1,64}");

    private final ProviderRegistry providers;
    private final AccountQueryService accounts;
    private final AccountRegistrationService registration;
    private final OAuth2Clients clients;
    private final OAuth2TokenRevoker revoker;
    private final Clock clock;

    ConnectService(ProviderRegistry providers, AccountQueryService accounts, AccountRegistrationService registration,
            OAuth2Clients clients, OAuth2TokenRevoker revoker, Clock clock) {
        this.providers = providers;
        this.accounts = accounts;
        this.registration = registration;
        this.clients = clients;
        this.revoker = revoker;
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
        String externalAccountId = null;
        if (accountId != null) {
            ConnectedAccount account = accounts.get(ownerId, accountId);
            if (!account.provider().equals(connector.type())) {
                throw AccountErrorCode.accountNotFound();
            }
            externalAccountId = account.externalAccountId();
        }
        return new PendingConnect(connector.type().value(), ownerId, accountId, externalAccountId,
                clients.authorizationRequest(connector.type(), connection, externalAccountId), clock.instant());
    }

    /**
     * Finishes a connect with what the provider sent back: a {@code code}, or an {@code error}. Exchanges the code,
     * checks the granted scopes, asks the connector who the account is and registers it (F02). A grant Sino will not
     * use (scope missing, wrong account) is revoked at once.
     *
     * @return the ID of the new or reconnected account
     * @throws ConnectFailure with the code the web shows; the log says why, never with a code or a token
     */
    public UUID complete(PendingConnect pending, String code, String error) {
        String provider = pending.provider();
        if (error != null) {
            if ("access_denied".equals(error)) {
                throw new ConnectFailure(ConnectErrorCode.CONNECT_CANCELLED);
            }
            throw failed(provider, "the provider sent back the error "
                    + (ERROR_CODE.matcher(error).matches() ? error : "(unrecognized)"));
        }
        if (code == null || code.isBlank()) {
            throw failed(provider, "the provider sent back neither a code nor an error");
        }
        MessageProvider connector = providers.find(ProviderType.of(provider))
                .orElseThrow(() -> failed(provider, "the connector is gone"));
        OAuth2Connection connection = connector.oauth2()
                .orElseThrow(() -> failed(provider, "the connector no longer connects over OAuth2"));

        OAuth2Tokens tokens;
        try {
            tokens = clients.exchange(pending.authorizationRequest(), code);
        } catch (OAuth2ExchangeException failure) {
            throw failed(provider, failure.getMessage());
        }
        if (!tokens.grantedScopes().containsAll(connection.requiredScopes())) {
            revoke(connector, connection, tokens);
            throw stopped(provider, ConnectErrorCode.CONNECT_SCOPE_DENIED);
        }
        if (tokens.refreshToken() == null) {
            throw failed(provider, "the token endpoint gave no refresh token");
        }

        OAuth2Credentials credentials = new OAuth2Credentials(tokens.accessToken(), tokens.expiresAt(),
                tokens.grantedScopes());
        AccountProfile profile;
        try {
            profile = connector.getAccountProfile(new ProviderContext(pending.accountId(), null, credentials));
        } catch (ProviderException failure) {
            throw failed(provider, "reading the account profile failed (" + failure.errorCode() + ")");
        } catch (IllegalArgumentException failure) {
            throw failed(provider, "the provider described the account incompletely");
        }
        if (pending.externalAccountId() != null && !pending.externalAccountId().equals(profile.externalAccountId())) {
            revoke(connector, connection, tokens);
            throw stopped(provider, ConnectErrorCode.CONNECT_WRONG_ACCOUNT);
        }
        return registration.register(new RegisterAccountCommand(pending.ownerId(), connector.type(), profile,
                credentials, tokens.refreshToken()));
    }

    // Revoking the refresh token drops the whole grant.
    private void revoke(MessageProvider connector, OAuth2Connection connection, OAuth2Tokens tokens) {
        revoker.revoke(connector.type(), connection.revocationUri(),
                tokens.refreshToken() != null ? tokens.refreshToken() : tokens.accessToken());
    }

    private static ConnectFailure failed(String provider, String reason) {
        LOG.warn("Connecting {} failed: {}", provider, reason);
        return new ConnectFailure(ConnectErrorCode.CONNECT_FAILED);
    }

    private static ConnectFailure stopped(String provider, ConnectErrorCode code) {
        LOG.info("Connecting {} stopped: {}", provider, code);
        return new ConnectFailure(code);
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
