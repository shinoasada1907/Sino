package dev.sino.account.application;

import java.time.Clock;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.common.error.SinoException;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderRegistryErrorCode;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.QrChallenge;
import dev.sino.provider.spi.QrLogin;
import dev.sino.provider.spi.QrLoginState;

/**
 * Connects an account by a QR code scanned in the provider's app (D-275), for any connector with a
 * {@link QrLogin}: a new one, or a reconnect of the same account at the provider. Knows nothing of HTTP; the web layer
 * keeps the {@link PendingQrConnect} in the browser session. Every call to the provider happens outside a transaction;
 * only the registration is one.
 */
@Service
public class QrConnectService {

    private static final Logger LOG = LoggerFactory.getLogger(QrConnectService.class);

    private final ProviderRegistry providers;
    private final AccountQueryService accounts;
    private final ConnectedAccountRepository repository;
    private final AccountRegistrationService registration;
    private final Clock clock;

    QrConnectService(ProviderRegistry providers, AccountQueryService accounts, ConnectedAccountRepository repository,
            AccountRegistrationService registration, Clock clock) {
        this.providers = providers;
        this.accounts = accounts;
        this.repository = repository;
        this.registration = registration;
        this.clock = clock;
    }

    /**
     * @param accountId the account to reconnect, or {@code null} for a new one
     * @throws SinoException with {@link ProviderRegistryErrorCode#UNKNOWN_PROVIDER},
     *         {@link AccountErrorCode#CONNECT_METHOD_MISMATCH}, {@link AccountErrorCode#PROVIDER_DISABLED},
     *         {@link AccountErrorCode#ACCOUNT_NOT_FOUND} when the account is not the owner's, is removed, or belongs to
     *         another provider, or {@link AccountErrorCode#QR_UNAVAILABLE} when the provider gives no QR code
     */
    public QrConnectStart start(UUID ownerId, String provider, UUID accountId) {
        MessageProvider connector = providers.get(typeOf(provider));
        QrLogin login = connector.qrLogin().orElseThrow(() -> new SinoException(
                AccountErrorCode.CONNECT_METHOD_MISMATCH, connector.displayName() + " is not connected by QR code."));
        if (!connector.turnedOn()) {
            throw new SinoException(AccountErrorCode.PROVIDER_DISABLED, connector.displayName() + " is turned off.");
        }
        String externalAccountId = null;
        if (accountId != null) {
            ConnectedAccount account = accounts.get(ownerId, accountId);
            if (!account.provider().equals(connector.type())) {
                throw AccountErrorCode.accountNotFound();
            }
            externalAccountId = account.externalAccountId();
        }
        QrChallenge challenge;
        try {
            challenge = login.start();
        } catch (ProviderException failure) {
            LOG.warn("Starting a QR login with {} failed ({})", connector.type(), failure.errorCode());
            throw qrUnavailable(connector);
        }
        return new QrConnectStart(new PendingQrConnect(connector.type().value(), ownerId, accountId,
                externalAccountId, challenge.loginId(), clock.instant()), challenge);
    }

    /**
     * Where the login is. Once the user confirmed, registers the account (F02): a reconnect must come back with the
     * same account, and an account another user has is never connected (D-290).
     *
     * @throws SinoException with {@link AccountErrorCode#QR_UNAVAILABLE} when the provider did not say; the login goes
     *         on, and asking again may answer
     */
    public QrConnectStatus status(PendingQrConnect pending) {
        MessageProvider connector = providers.find(ProviderType.of(pending.provider())).orElse(null);
        QrLogin login = connector == null ? null : connector.qrLogin().orElse(null);
        if (login == null) {
            return failed(pending, "the connector is gone or no longer connects by QR code");
        }
        QrLoginState state;
        try {
            state = login.status(pending.loginId());
        } catch (ProviderException failure) {
            LOG.warn("Asking {} where a QR login is failed ({})", connector.type(), failure.errorCode());
            throw qrUnavailable(connector);
        }
        return switch (state) {
            case QrLoginState.Waiting waiting -> QrConnectStatus.waiting();
            case QrLoginState.Scanned scanned -> QrConnectStatus.scanned(scanned.displayName());
            case QrLoginState.Expired expired -> QrConnectStatus.ended(QrConnectStatus.State.EXPIRED);
            case QrLoginState.Declined declined -> QrConnectStatus.ended(QrConnectStatus.State.DECLINED);
            case QrLoginState.Failed failure -> failed(pending, failure.reason());
            case QrLoginState.Done done -> finish(pending, connector, done);
        };
    }

    /** Ends the login at the provider; a failure there is only logged, since the user has already given up. */
    public void cancel(PendingQrConnect pending) {
        providers.find(ProviderType.of(pending.provider())).flatMap(MessageProvider::qrLogin).ifPresent(login -> {
            try {
                login.cancel(pending.loginId());
            } catch (RuntimeException failure) {
                LOG.warn("Cancelling a {} QR login failed: {}", pending.provider(), failure.getClass().getSimpleName());
            }
        });
    }

    private QrConnectStatus finish(PendingQrConnect pending, MessageProvider connector, QrLoginState.Done done) {
        AccountProfile profile = done.profile();
        ProviderType type = connector.type();
        if (pending.accountId() != null && !pending.externalAccountId().equals(profile.externalAccountId())) {
            return stopped(pending, ConnectErrorCode.CONNECT_WRONG_ACCOUNT);
        }
        // Checked here, not in register: the OAuth2 connect goes through register too, and Gmail allows it (D-290).
        if (repository.existsByProviderAndExternalAccountIdAndOwnerIdNotAndRemovedAtIsNull(type,
                profile.externalAccountId(), pending.ownerId())) {
            return stopped(pending, ConnectErrorCode.CONNECT_ACCOUNT_IN_USE);
        }
        boolean reconnected = accounts.hasAccount(pending.ownerId(), type, profile.externalAccountId());
        if (pending.accountId() != null && !reconnected) {
            return failed(pending, "the account to reconnect was removed meanwhile");
        }
        UUID accountId;
        try {
            accountId = registration.register(new RegisterAccountCommand(pending.ownerId(), type, profile,
                    done.credentials(), null));
        } catch (RuntimeException failure) {
            // The provider said DONE once and forgot the login: failing here must end it, not leave it to a later poll.
            return failed(pending, "registering the account failed (" + failure.getClass().getSimpleName() + ")");
        }
        return QrConnectStatus.done(accountId, reconnected);
    }

    private static QrConnectStatus failed(PendingQrConnect pending, String reason) {
        LOG.warn("Connecting {} by QR code failed: {}", pending.provider(), reason);
        return QrConnectStatus.failed(ConnectErrorCode.CONNECT_FAILED);
    }

    private static QrConnectStatus stopped(PendingQrConnect pending, ConnectErrorCode code) {
        LOG.info("Connecting {} by QR code stopped: {}", pending.provider(), code);
        return QrConnectStatus.failed(code);
    }

    private static SinoException qrUnavailable(MessageProvider connector) {
        return new SinoException(AccountErrorCode.QR_UNAVAILABLE,
                connector.displayName() + " did not answer. Try again in a moment.");
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
