package dev.sino.account.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
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
import dev.sino.account.AccountListing;
import dev.sino.account.AccountRoster;
import dev.sino.account.AccountStatus;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.ConnectedAccountRepository;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;

/**
 * Every account of every owner, as the admin module reads them (D-265), against a real database. Other tests leave
 * accounts behind, so each test looks at the accounts it made, in the order the roster gives them.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, AccountRosterService.class })
@ActiveProfiles("test")
class AccountRosterServiceTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");

    @Autowired
    private AccountRoster roster;

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
        alice = users.save(new AppUser("alice@roster.test", "Alice")).id();
        bob = users.save(new AppUser("bob@roster.test", "Bob")).id();
    }

    @Test
    void listsTheAccountsOfEveryOwnerOldestFirst() {
        ConnectedAccount bobs = accounts.saveAndFlush(register(bob, "bob-sub", "bob@gmail.test"));
        ConnectedAccount alices = register(alice, "alice-sub", "alice@gmail.test");
        alices.markAuthExpired();
        alices.pauseSync();
        accounts.saveAndFlush(alices);
        connectedAt(alices, "2026-01-01T00:00:00Z");
        connectedAt(bobs, "2026-02-01T00:00:00Z");

        assertThat(listed(alices, bobs)).containsExactly(
                new AccountListing(alices.id(), alice, GMAIL, AccountStatus.AUTH_EXPIRED, "alice@gmail.test", false,
                        Instant.parse("2026-01-01T00:00:00Z")),
                new AccountListing(bobs.id(), bob, GMAIL, AccountStatus.CONNECTED, "bob@gmail.test", true,
                        Instant.parse("2026-02-01T00:00:00Z")));
    }

    @Test
    void leavesOutARemovedAccount() {
        ConnectedAccount kept = accounts.saveAndFlush(register(alice, "kept-sub", "kept@gmail.test"));
        ConnectedAccount removed = register(alice, "removed-sub", "removed@gmail.test");
        removed.remove(Instant.parse("2026-10-07T09:00:00Z"));
        accounts.saveAndFlush(removed);
        entityManager.clear();

        assertThat(listed(kept, removed)).extracting(AccountListing::id).containsExactly(kept.id());
    }

    @Test
    void anAccountWithoutAnAddressListsNull() {
        ConnectedAccount chat = accounts.saveAndFlush(register(alice, "4242", null));

        assertThat(listed(chat)).extracting(AccountListing::address).containsOnlyNulls();
    }

    private List<AccountListing> listed(ConnectedAccount... made) {
        Set<UUID> wanted = Set.of(Arrays.stream(made).map(ConnectedAccount::id).toArray(UUID[]::new));
        return roster.allAccounts().stream().filter(account -> wanted.contains(account.id())).toList();
    }

    private void connectedAt(ConnectedAccount account, String at) {
        jdbc.update("update connected_account set created_at = ? where id = ?",
                Timestamp.from(Instant.parse(at)), account.id());
        entityManager.clear();
    }

    private static ConnectedAccount register(UUID owner, String externalAccountId, String address) {
        return ConnectedAccount.register(owner, GMAIL, externalAccountId, "Account", null, address);
    }

}
