package dev.sino.account.application;

import java.time.Clock;
import java.time.Duration;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.account.AccountStatus;
import dev.sino.account.AccountStatusChanged;
import dev.sino.account.ProviderAccess;
import dev.sino.account.ProviderCall;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialSnapshot;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.account.infrastructure.oauth.OAuth2Clients;
import dev.sino.account.infrastructure.oauth.OAuth2Tokens;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

/**
 * {@link ProviderAccess} (F04b): at most one refresh and two calls to the connector per call. Talks to the
 * provider outside any transaction; only storing a refreshed credential and ending an authorization are one.
 */
@Service
public class ProviderAccessService implements ProviderAccess {

    private static final Logger LOG = LoggerFactory.getLogger(ProviderAccessService.class);
    // Refreshed this long before it runs out, so it does not run out during the call.
    static final Duration REFRESH_AHEAD = Duration.ofSeconds(60);
    private static final String REFUSED_FRESH_TOKEN = "the provider refused a freshly refreshed token";

    private final ConnectedAccountRepository accounts;
    private final CredentialStore credentials;
    private final ProviderRegistry providers;
    private final OAuth2Clients clients;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;
    private final Clock clock;

    ProviderAccessService(ConnectedAccountRepository accounts, CredentialStore credentials, ProviderRegistry providers,
            OAuth2Clients clients, ApplicationEventPublisher events, PlatformTransactionManager transactionManager,
            Clock clock) {
        this.accounts = accounts;
        this.credentials = credentials;
        this.providers = providers;
        this.clients = clients;
        this.events = events;
        this.transaction = new TransactionTemplate(transactionManager);
        this.clock = clock;
    }

    @Override
    public <T> T call(UUID accountId, ProviderCall<T> call) {
        Objects.requireNonNull(call, "call must not be null");
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("ProviderAccess talks to the provider: call it outside a transaction");
        }
        ConnectedAccount account = accounts.findByIdAndRemovedAtIsNull(accountId)
                .orElseThrow(AccountErrorCode::accountNotFound);
        if (account.status() == AccountStatus.DISABLED) {
            throw AccountErrorCode.accountDisabled();
        }
        if (account.status() == AccountStatus.AUTH_EXPIRED) {
            throw mustReconnect();
        }
        Target target = new Target(account.id(), account.externalAccountId(), account.provider(),
                providers.get(account.provider()));
        CredentialSnapshot credential = stored(accountId);
        boolean refreshed = false;
        if (expiresSoon(credential) && refreshable(target, credential)) {
            credential = refresh(target, credential);
            refreshed = true;
        }

        try {
            return call.apply(target.connector(), target.context(credential));
        } catch (ProviderException refused) {
            if (refused.errorCode() != ProviderErrorCode.AUTH_EXPIRED) {
                throw refused;
            }
            if (refreshed) {
                throw expire(target, credential, REFUSED_FRESH_TOKEN);
            }
            if (!refreshable(target, credential)) {
                throw expire(target, credential, "the provider refused a credential that cannot be refreshed");
            }
        }
        CredentialSnapshot fresh = refresh(target, credential);
        try {
            return call.apply(target.connector(), target.context(fresh));
        } catch (ProviderException refused) {
            if (refused.errorCode() == ProviderErrorCode.AUTH_EXPIRED) {
                throw expire(target, fresh, REFUSED_FRESH_TOKEN);
            }
            throw refused;
        }
    }

    private boolean expiresSoon(CredentialSnapshot credential) {
        return credential.credential() instanceof OAuth2Credentials oauth && oauth.expiresAt() != null
                && oauth.expiresAt().isBefore(clock.instant().plus(REFRESH_AHEAD));
    }

    private static boolean refreshable(Target target, CredentialSnapshot credential) {
        return credential.credential() instanceof OAuth2Credentials && credential.refreshToken() != null
                && target.connector().oauth2().isPresent();
    }

    /** The credential to use after a refresh: the one it produced, or a newer one written meanwhile. */
    private CredentialSnapshot refresh(Target target, CredentialSnapshot credential) {
        String registrationId = target.connector().oauth2().orElseThrow().registrationId();
        OAuth2Tokens tokens;
        try {
            tokens = clients.refresh(registrationId, (OAuth2Credentials) credential.credential(),
                    credential.refreshToken());
        } catch (ProviderException failure) {
            if (failure.errorCode() == ProviderErrorCode.AUTH_EXPIRED) {
                throw expire(target, credential, "the provider refused the refresh token");
            }
            LOG.warn("Could not refresh the token of account {} ({}): {}", target.accountId(), target.provider(),
                    failure.getMessage());
            throw failure;
        }
        try {
            credentials.replaceIfUnchanged(target.accountId(), credential,
                    new OAuth2Credentials(tokens.accessToken(), tokens.expiresAt(), tokens.grantedScopes()),
                    tokens.refreshToken());
        } catch (OptimisticLockingFailureException written) {
            // Written by a reconnect or another refresh after the check: the stored one below is theirs.
        }
        return stored(target.accountId());
    }

    private CredentialSnapshot stored(UUID accountId) {
        // None while the account is being removed: removal deletes the credential with the account.
        return credentials.snapshot(accountId).orElseThrow(AccountErrorCode::accountNotFound);
    }

    /**
     * Moves the account to AUTH_EXPIRED, unless it changed during the call: a reconnect brought a new credential, or
     * someone else wrote the account. The credential {@code used} was refused, not that one. The caller throws the
     * result.
     */
    private ProviderException expire(Target target, CredentialSnapshot used, String reason) {
        boolean marked;
        try {
            marked = Boolean.TRUE.equals(transaction.execute(status -> {
                Optional<ConnectedAccount> account = accounts.findByIdAndRemovedAtIsNull(target.accountId());
                if (account.isEmpty() || !credentials.isCurrent(target.accountId(), used)) {
                    return false;
                }
                account.get().markAuthExpired().ifPresent(change -> events.publishEvent(
                        new AccountStatusChanged(target.accountId(), change.from(), change.to(), clock.instant())));
                return true;
            }));
        } catch (OptimisticLockingFailureException written) {
            marked = false;
        }
        if (!marked) {
            LOG.info("Account {} ({}) changed during the call, so it is left as it is: {}", target.accountId(),
                    target.provider(), reason);
            return new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                    "The account changed during the call; try again");
        }
        LOG.info("Account {} ({}) must be reconnected: {}", target.accountId(), target.provider(), reason);
        return mustReconnect();
    }

    private static ProviderException mustReconnect() {
        return new ProviderException(ProviderErrorCode.AUTH_EXPIRED,
                "The provider no longer accepts the credentials of this account; it must be reconnected");
    }

    /** What a call needs of the account, read once, outside any transaction. */
    private record Target(UUID accountId, String externalAccountId, ProviderType provider, MessageProvider connector) {

        ProviderContext context(CredentialSnapshot credential) {
            return new ProviderContext(accountId, externalAccountId, credential.credential());
        }

    }

}
