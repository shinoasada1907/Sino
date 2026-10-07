package dev.sino.account.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import java.lang.reflect.RecordComponent;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.ApplicationModuleTest.BootstrapMode;
import org.springframework.modulith.test.AssertablePublishedEvents;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.jdbc.JdbcTestUtils;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.AccountConnected;
import dev.sino.account.domain.AccountStatus;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.account.infrastructure.CredentialStore;
import dev.sino.common.error.SinoException;
import dev.sino.provider.FakeMessageProvider;
import dev.sino.provider.ProviderRegistryErrorCode;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.OAuth2Credentials;

/**
 * Module test: the account module and the modules it uses directly, on a real PostgreSQL. The test methods are
 * not transactional, so every call commits or rolls back exactly as it would in the application.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class AccountRegistrationServiceTests {

    private static final ProviderType FAKE = ProviderType.of("fake");
    private static final OAuth2Credentials CREDENTIALS = new OAuth2Credentials("ya29.sample-access-token", null,
            Set.of("mail.read"));
    private static final String REFRESH = "1//sample-refresh-token";

    @Autowired
    private AccountRegistrationService registration;

    @Autowired
    private ConnectedAccountRepository accounts;

    @MockitoSpyBean
    private CredentialStore credentials;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        JdbcTestUtils.deleteFromTables(jdbc, "connected_account", "app_user");
        owner = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, 'owner@sino.test', 'Owner', 'ACTIVE', now(), now())", owner);
    }

    @Test
    void connectsANewAccount(AssertablePublishedEvents events) {
        Instant before = Instant.now();

        UUID id = registration.register(command("me@fake.test", "Me", CREDENTIALS, REFRESH));

        ConnectedAccount account = accounts.findById(id).orElseThrow();
        assertThat(account.ownerId()).isEqualTo(owner);
        assertThat(account.provider()).isEqualTo(FAKE);
        assertThat(account.externalAccountId()).isEqualTo("me@fake.test");
        assertThat(account.displayName()).isEqualTo("Me");
        assertThat(account.status()).isEqualTo(AccountStatus.CONNECTED);
        assertThat(credentials.load(id)).contains(CREDENTIALS);
        assertThat(events.ofType(AccountConnected.class)).singleElement().satisfies(event -> {
            assertThat(event.accountId()).isEqualTo(id);
            assertThat(event.ownerId()).isEqualTo(owner);
            assertThat(event.provider()).isEqualTo(FAKE);
            assertThat(event.reconnected()).isFalse();
            assertThat(event.occurredAt()).isBetween(before, Instant.now());
        });
    }

    @Test
    void connectingTheSameAccountAgainReconnectsIt(AssertablePublishedEvents events) {
        UUID first = registration.register(command("me@fake.test", "Old name", CREDENTIALS, REFRESH));
        jdbc.update("update connected_account set status = 'AUTH_EXPIRED' where id = ?", first);
        OAuth2Credentials renewed = new OAuth2Credentials("ya29.renewed-access-token", null, Set.of("mail.read"));

        UUID second = registration.register(command("me@fake.test", "New name", renewed, null));

        assertThat(second).isEqualTo(first);
        assertThat(JdbcTestUtils.countRowsInTable(jdbc, "connected_account")).isEqualTo(1);
        ConnectedAccount account = accounts.findById(first).orElseThrow();
        assertThat(account.status()).isEqualTo(AccountStatus.CONNECTED);
        assertThat(account.displayName()).isEqualTo("New name");
        assertThat(credentials.load(first)).contains(renewed);
        assertThat(events.ofType(AccountConnected.class)).extracting(AccountConnected::reconnected)
                .containsExactly(false, true);
    }

    @Test
    void anUnknownProviderIsRefusedAndNothingIsWritten(AssertablePublishedEvents events) {
        RegisterAccountCommand command = new RegisterAccountCommand(owner, ProviderType.of("nope"),
                new AccountProfile("me@nope.test", "Me", null), CREDENTIALS, null);

        assertThatThrownBy(() -> registration.register(command))
                .isInstanceOfSatisfying(SinoException.class, failure -> assertThat(failure.errorCode())
                        .isEqualTo(ProviderRegistryErrorCode.UNKNOWN_PROVIDER));

        assertThat(JdbcTestUtils.countRowsInTable(jdbc, "connected_account")).isZero();
        assertThat(events.ofType(AccountConnected.class)).isEmpty();
    }

    @Test
    void aFailedCredentialSaveLeavesNothingBehind(AssertablePublishedEvents events) {
        doThrow(new IllegalStateException("credential storage failed")).when(credentials).save(any(), any(), any());

        assertThatThrownBy(() -> registration.register(command("me@fake.test", "Me", CREDENTIALS, REFRESH)))
                .isInstanceOf(IllegalStateException.class);

        assertThat(JdbcTestUtils.countRowsInTable(jdbc, "connected_account")).isZero();
        assertThat(JdbcTestUtils.countRowsInTable(jdbc, "account_credential")).isZero();
        assertThat(events.ofType(AccountConnected.class)).isEmpty();
    }

    @Test
    void theEventHoldsOnlyIdsProviderFlagAndTime() {
        assertThat(AccountConnected.class.getRecordComponents()).extracting(RecordComponent::getName)
                .containsExactly("accountId", "ownerId", "provider", "reconnected", "occurredAt");
    }

    private RegisterAccountCommand command(String externalAccountId, String displayName,
            OAuth2Credentials credential, String refreshToken) {
        return new RegisterAccountCommand(owner, FAKE, new AccountProfile(externalAccountId, displayName, null),
                credential, refreshToken);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeProviders {

        @Bean
        FakeMessageProvider fakeProvider() {
            return FakeMessageProvider.builder("fake").build();
        }

    }

}
