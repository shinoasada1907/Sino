package dev.sino.account.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountStatus;
import dev.sino.account.AccountSummary;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;

/** The accounts other modules see (F05), against a real database. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, AccountDirectoryService.class })
@ActiveProfiles("test")
class AccountDirectoryServiceTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final ProviderType TELEGRAM = ProviderType.of("telegram");

    @Autowired
    private AccountDirectory directory;

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
    void listsTheAccountsOfTheOwnerOldestFirstWhateverTheirStatus() {
        ConnectedAccount work = accounts.saveAndFlush(register(alice, GMAIL, "alice@work.test"));
        ConnectedAccount chat = register(alice, TELEGRAM, "4242");
        chat.disable();
        accounts.saveAndFlush(chat);
        ConnectedAccount expired = register(alice, GMAIL, "alice@home.test");
        expired.markAuthExpired();
        accounts.saveAndFlush(expired);
        accounts.saveAndFlush(register(bob, GMAIL, "bob@gmail.test"));
        // Neither the order saved nor the order updated (PostgreSQL appends updated rows) nor the order of the unique
        // index is the expected one, so only ORDER BY created_at can give it.
        connectedAt(expired, "2026-03-01T00:00:00Z");
        connectedAt(work, "2026-02-01T00:00:00Z");
        connectedAt(chat, "2026-01-01T00:00:00Z");

        assertThat(directory.accountsOf(alice)).containsExactly(
                new AccountSummary(chat.id(), TELEGRAM, AccountStatus.DISABLED, "4242"),
                new AccountSummary(work.id(), GMAIL, AccountStatus.CONNECTED, "alice@work.test"),
                new AccountSummary(expired.id(), GMAIL, AccountStatus.AUTH_EXPIRED, "alice@home.test"));
    }

    @Test
    void findsAnAccountOfTheOwner() {
        ConnectedAccount work = accounts.saveAndFlush(register(alice, GMAIL, "alice@work.test"));

        assertThat(directory.find(alice, work.id()))
                .contains(new AccountSummary(work.id(), GMAIL, AccountStatus.CONNECTED, "alice@work.test"));
    }

    @Test
    void findsAnAccountWhateverItsStatus() {
        ConnectedAccount turnedOff = register(alice, GMAIL, "off@gmail.test");
        turnedOff.disable();
        accounts.saveAndFlush(turnedOff);
        ConnectedAccount expired = register(alice, GMAIL, "expired@gmail.test");
        expired.markAuthExpired();
        accounts.saveAndFlush(expired);

        assertThat(directory.find(alice, turnedOff.id())).get().extracting(AccountSummary::status)
                .isEqualTo(AccountStatus.DISABLED);
        assertThat(directory.find(alice, expired.id())).get().extracting(AccountSummary::status)
                .isEqualTo(AccountStatus.AUTH_EXPIRED);
    }

    @Test
    void aRemovedAccountIsLeftOut() {
        ConnectedAccount kept = accounts.saveAndFlush(register(alice, GMAIL, "kept@gmail.test"));
        ConnectedAccount removed = register(alice, GMAIL, "removed@gmail.test");
        removed.remove(Instant.parse("2026-10-07T09:00:00Z"));
        accounts.saveAndFlush(removed);
        entityManager.clear();

        assertThat(directory.accountsOf(alice)).extracting(AccountSummary::id).containsExactly(kept.id());
        assertThat(directory.find(alice, removed.id())).isEmpty();
    }

    @Test
    void anAccountOfAnotherOwnerIsLeftOut() {
        ConnectedAccount bobs = accounts.saveAndFlush(register(bob, GMAIL, "bob@gmail.test"));

        assertThat(directory.find(alice, bobs.id())).isEmpty();
        assertThat(directory.accountsOf(alice)).isEmpty();
        assertThat(directory.find(bob, bobs.id())).isPresent();
    }

    @Test
    void anUnknownAccountIsNotFound() {
        assertThat(directory.find(alice, UUID.randomUUID())).isEmpty();
    }

    private void connectedAt(ConnectedAccount account, String at) {
        jdbc.update("update connected_account set created_at = ? where id = ?",
                Timestamp.from(Instant.parse(at)), account.id());
        entityManager.clear();
    }

    private static ConnectedAccount register(UUID owner, ProviderType provider, String externalAccountId) {
        return ConnectedAccount.register(owner, provider, externalAccountId, "Account", null, null);
    }

}
