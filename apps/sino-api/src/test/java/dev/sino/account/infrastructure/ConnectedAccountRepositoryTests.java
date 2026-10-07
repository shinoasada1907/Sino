package dev.sino.account.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.AccountStatus;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ConnectedAccountRepositoryTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");

    @Autowired
    private ConnectedAccountRepository accounts;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID alice;
    private UUID bob;

    @BeforeEach
    void createUsers() {
        alice = users.save(new AppUser("alice@example.com", "Alice")).id();
        bob = users.save(new AppUser("bob@example.com", "Bob")).id();
    }

    @Test
    void savesAndReadsEveryField() {
        ConnectedAccount saved = accounts.saveAndFlush(ConnectedAccount.register(alice, GMAIL, "alice@gmail.com",
                "Gmail Alice", "https://example.com/a.png"));
        entityManager.clear();

        ConnectedAccount read = accounts.findById(saved.id()).orElseThrow();

        assertThat(read.id().version()).as("UUIDv7 (D-08)").isEqualTo(7);
        assertThat(read.ownerId()).isEqualTo(alice);
        assertThat(read.provider()).isEqualTo(GMAIL);
        assertThat(read.externalAccountId()).isEqualTo("alice@gmail.com");
        assertThat(read.displayName()).isEqualTo("Gmail Alice");
        assertThat(read.avatarUrl()).isEqualTo("https://example.com/a.png");
        assertThat(read.status()).isEqualTo(AccountStatus.CONNECTED);
        assertThat(read.syncEnabled()).isTrue();
        assertThat(read.lastSyncedAt()).isNull();
        assertThat(read.createdAt()).isNotNull();
        assertThat(read.updatedAt()).isEqualTo(read.createdAt());
    }

    @Test
    void storesProviderAndStatusAsText() {
        ConnectedAccount saved = accounts.saveAndFlush(register(alice, "alice@gmail.com"));

        assertThat(jdbc.queryForMap("select provider, status from connected_account where id = ?", saved.id()))
                .containsEntry("provider", "gmail")
                .containsEntry("status", "CONNECTED");
    }

    @Test
    void aStatusChangeIsSavedAndBumpsTheVersion() {
        ConnectedAccount saved = accounts.saveAndFlush(register(alice, "alice@gmail.com"));

        saved.disable();
        accounts.saveAndFlush(saved);
        entityManager.clear();

        assertThat(accounts.findById(saved.id()).orElseThrow().status()).isEqualTo(AccountStatus.DISABLED);
        assertThat(jdbc.queryForObject("select version from connected_account where id = ?", Long.class, saved.id()))
                .isEqualTo(1L);
    }

    @Test
    void oneRowPerProviderAccountOfAUser() {
        accounts.saveAndFlush(register(alice, "alice@gmail.com"));

        assertThatThrownBy(() -> accounts.saveAndFlush(register(alice, "alice@gmail.com")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anotherUserMayConnectTheSameProviderAccount() {
        accounts.saveAndFlush(register(alice, "shared@gmail.com"));
        accounts.saveAndFlush(register(bob, "shared@gmail.com"));

        assertThat(accounts.count()).isEqualTo(2);
    }

    @Test
    void theDatabaseRefusesAnUnknownStatus() {
        ConnectedAccount saved = accounts.saveAndFlush(register(alice, "alice@gmail.com"));

        assertThatThrownBy(() -> jdbc.update("update connected_account set status = 'SYNCING' where id = ?",
                saved.id()))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("connected_account_status_ck");
    }

    @Test
    void findsTheAccountsOfOneUserOldestFirst() {
        ConnectedAccount first = accounts.saveAndFlush(register(alice, "a1@gmail.com"));
        ConnectedAccount second = accounts.saveAndFlush(register(alice, "a2@gmail.com"));
        accounts.saveAndFlush(register(bob, "b1@gmail.com"));

        List<ConnectedAccount> found = accounts.findByOwnerIdOrderByCreatedAtAscIdAsc(alice);

        assertThat(found).extracting(ConnectedAccount::id).containsExactlyInAnyOrder(first.id(), second.id());
        assertThat(found).extracting(ConnectedAccount::createdAt).isSorted();
    }

    @Test
    void findsAnAccountByItsKey() {
        ConnectedAccount saved = accounts.saveAndFlush(register(alice, "alice@gmail.com"));

        assertThat(accounts.findByOwnerIdAndProviderAndExternalAccountId(alice, GMAIL, "alice@gmail.com"))
                .get().extracting(ConnectedAccount::id).isEqualTo(saved.id());
        assertThat(accounts.findByOwnerIdAndProviderAndExternalAccountId(bob, GMAIL, "alice@gmail.com")).isEmpty();
    }

    private static ConnectedAccount register(UUID owner, String externalAccountId) {
        return ConnectedAccount.register(owner, GMAIL, externalAccountId, "Gmail", null);
    }

}
