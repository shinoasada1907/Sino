package dev.sino.account.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.account.AccountConnected;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.spi.AccountProfile;

/**
 * The entry point the connect flow (F04) calls once the provider has confirmed an account. Creates the account, or
 * reconnects the one with the same {@code (owner, provider, externalAccountId)}, stores its credential and
 * publishes {@link AccountConnected}, all in one transaction. Never calls the provider: the connect flow does that
 * before, outside the transaction.
 */
@Service
public class AccountRegistrationService {

    private final ProviderRegistry providers;
    private final ConnectedAccountRepository accounts;
    private final CredentialStore credentials;
    private final ApplicationEventPublisher events;

    AccountRegistrationService(ProviderRegistry providers, ConnectedAccountRepository accounts,
            CredentialStore credentials, ApplicationEventPublisher events) {
        this.providers = providers;
        this.accounts = accounts;
        this.credentials = credentials;
        this.events = events;
    }

    /**
     * @return the ID of the new or reconnected account
     * @throws dev.sino.common.error.SinoException with
     *         {@link dev.sino.provider.ProviderRegistryErrorCode#UNKNOWN_PROVIDER} when no connector has the
     *         provider type; nothing is written then
     */
    @Transactional
    public UUID register(RegisterAccountCommand command) {
        providers.get(command.provider());
        AccountProfile profile = command.profile();
        Optional<ConnectedAccount> existing = accounts.findByOwnerIdAndProviderAndExternalAccountId(
                command.ownerId(), command.provider(), profile.externalAccountId());

        ConnectedAccount account;
        if (existing.isPresent()) {
            account = existing.get();
            // A real status change (for example AUTH_EXPIRED to CONNECTED) gets its AccountStatusChanged in BE-16.
            account.reconnect(profile.displayName(), profile.avatarUrl());
        } else {
            account = accounts.save(ConnectedAccount.register(command.ownerId(), command.provider(),
                    profile.externalAccountId(), profile.displayName(), profile.avatarUrl()));
        }

        credentials.save(account.id(), command.credentials(), command.refreshToken());
        events.publishEvent(new AccountConnected(account.id(), account.ownerId(), account.provider(),
                existing.isPresent(), Instant.now()));
        return account.id();
    }

}
