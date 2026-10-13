package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.UserDirectory;
import dev.sino.identity.UserSummary;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;

/**
 * Every Sino user, as the admin module reads them (D-265), against a real database. Other tests leave users behind,
 * so each test looks at the users it made, in the order the directory gives them.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, UserDirectoryService.class })
@ActiveProfiles("test")
class UserDirectoryServiceTests {

    @Autowired
    private UserDirectory directory;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void listsEveryUserOldestFirst() {
        UUID bob = users.saveAndFlush(new AppUser("bob@example.com", "Bob")).id();
        UUID alice = users.saveAndFlush(new AppUser("alice@example.com", "Alice")).id();
        // Saved in the other order, so only ORDER BY created_at gives the expected one.
        createdAt(alice, "2026-01-01T00:00:00Z");
        createdAt(bob, "2026-02-01T00:00:00Z");

        assertThat(listed(alice, bob)).containsExactly(
                new UserSummary(alice, "alice@example.com", "Alice", "ACTIVE",
                        Instant.parse("2026-01-01T00:00:00Z")),
                new UserSummary(bob, "bob@example.com", "Bob", "ACTIVE", Instant.parse("2026-02-01T00:00:00Z")));
    }

    @Test
    void usersCreatedAtTheSameMomentComeInIdOrder() {
        UUID first = users.saveAndFlush(new AppUser("first@example.com", "First")).id();
        UUID second = users.saveAndFlush(new AppUser("second@example.com", "Second")).id();
        createdAt(first, "2026-01-01T00:00:00Z");
        createdAt(second, "2026-01-01T00:00:00Z");
        UUID lower = first.compareTo(second) < 0 ? first : second;
        UUID higher = lower.equals(first) ? second : first;

        assertThat(listed(first, second)).extracting(UserSummary::id).containsExactly(lower, higher);
    }

    @Test
    void tellsADisabledUser() {
        UUID carol = users.saveAndFlush(new AppUser("carol@example.com", "Carol")).id();
        jdbc.update("update app_user set status = 'DISABLED' where id = ?", carol);
        entityManager.clear();

        assertThat(listed(carol)).extracting(UserSummary::status).containsExactly("DISABLED");
    }

    private List<UserSummary> listed(UUID... ids) {
        Set<UUID> wanted = Set.of(ids);
        return directory.allUsers().stream().filter(user -> wanted.contains(user.id())).toList();
    }

    private void createdAt(UUID user, String at) {
        jdbc.update("update app_user set created_at = ? where id = ?", Timestamp.from(Instant.parse(at)), user);
        entityManager.clear();
    }

}
