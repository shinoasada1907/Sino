package dev.sino.account.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.FakeQrLogin;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.QrLoginState;
import dev.sino.provider.spi.TokenCredentials;

/** What the QR connect does when the step after the confirmed login fails, which the API tests cannot make happen. */
class QrConnectServiceTests {

    private static final UUID OWNER = UUID.randomUUID();

    private final FakeQrLogin qr = new FakeQrLogin();
    private final ProviderRegistry providers = mock(ProviderRegistry.class);
    private final AccountQueryService accounts = mock(AccountQueryService.class);
    private final ConnectedAccountRepository repository = mock(ConnectedAccountRepository.class);
    private final AccountRegistrationService registration = mock(AccountRegistrationService.class);
    private final QrConnectService connect = new QrConnectService(providers, accounts, repository, registration,
            Clock.fixed(Instant.parse("2026-10-17T08:00:00Z"), ZoneOffset.UTC));

    // The login is over at the provider (DONE comes once): an error here must end it, not leave it to fail later.
    @Test
    void aRegistrationThatFailsEndsTheLoginAsFailed() {
        given(providers.get(ProviderType.of("fake-qr"))).willReturn(FakeMessageProvider.builder("fake-qr").qrLogin(qr)
                .build());
        given(providers.find(ProviderType.of("fake-qr"))).willReturn(Optional.of(FakeMessageProvider
                .builder("fake-qr").qrLogin(qr).build()));
        given(registration.register(any())).willThrow(new DataIntegrityViolationException("duplicate key"));
        PendingQrConnect pending = connect.start(OWNER, "fake-qr", null).pending();
        qr.answer(pending.loginId(), new QrLoginState.Done(new AccountProfile("100000000000000001", "Lan", null, null),
                new TokenCredentials("{\"cookie\": [], \"imei\": \"i\", \"userAgent\": \"u\"}")));

        QrConnectStatus status = connect.status(pending);

        assertThat(status.state()).isEqualTo(QrConnectStatus.State.FAILED);
        assertThat(status.code()).isEqualTo(ConnectErrorCode.CONNECT_FAILED);
        assertThat(status.over()).isTrue();
    }

}
