package dev.sino.sync.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.TestcontainersConfiguration;
import dev.sino.sync.AccountSyncStatus;
import dev.sino.sync.SyncStatuses;
import dev.sino.sync.infrastructure.SyncCheckpoints;

/**
 * Where the reading of an account stands, as the admin module reads it (D-265), written the way the sync module writes
 * it, in a real PostgreSQL. {@code sync_checkpoint} has no foreign key to the account (it is another module's table),
 * so a random account ID will do; each test runs in a transaction that is rolled back.
 */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, SyncCheckpoints.class, SyncStatusService.class })
@ActiveProfiles("test")
class SyncStatusServiceTests {

    @Autowired
    private SyncStatuses statuses;

    @Autowired
    private SyncCheckpoints checkpoints;

    private final UUID account = UUID.randomUUID();

    @Test
    void anAccountNeverImportedHasNoImportAndNoPush() {
        AccountSyncStatus status = statuses.statusOf(account);

        assertThat(status).isEqualTo(new AccountSyncStatus("NONE", null, null, null, "OFF"));
        assertThat(status.failing()).isFalse();
    }

    @Test
    void anImportThatRuns() {
        checkpoints.start(account, "ALL", null);

        assertThat(statuses.statusOf(account)).isEqualTo(new AccountSyncStatus("RUNNING", null, null, null, "OFF"));
    }

    @Test
    void anImportThatFailedTellsItsCode() {
        checkpoints.start(account, "ALL", null);
        checkpoints.fail(account, "AUTH_EXPIRED");

        AccountSyncStatus status = statuses.statusOf(account);

        assertThat(status.importStatus()).isEqualTo("FAILED");
        assertThat(status.importError()).isEqualTo("AUTH_EXPIRED");
        assertThat(status.failing()).isTrue();
    }

    @Test
    void aDoneImportWithASuccessfulSync() {
        importDone();
        checkpoints.beginSync(account);
        checkpoints.advanceSync(account, "page-2", true);

        AccountSyncStatus status = statuses.statusOf(account);

        assertThat(status.importStatus()).isEqualTo("DONE");
        assertThat(status.lastSyncAt()).isNotNull();
        assertThat(status.syncError()).isNull();
        assertThat(status.failing()).isFalse();
    }

    @Test
    void aFailedSyncTellsItsCode() {
        importDone();
        checkpoints.syncFailed(account, "RATE_LIMITED");

        AccountSyncStatus status = statuses.statusOf(account);

        assertThat(status.importStatus()).isEqualTo("DONE");
        assertThat(status.syncError()).isEqualTo("RATE_LIMITED");
        assertThat(status.failing()).isTrue();
    }

    @Test
    void notificationsThatAreOnArePushActive() {
        importDone();
        checkpoints.watched(account, "owner@gmail.test", Instant.now().plus(Duration.ofDays(5)));

        AccountSyncStatus status = statuses.statusOf(account);

        assertThat(status.push()).isEqualTo("ACTIVE");
        assertThat(status.failing()).isFalse();
    }

    @Test
    void notificationsThatCouldNotBeTurnedOnArePushFailed() {
        importDone();
        checkpoints.watchFailed(account, "PROVIDER_UNAVAILABLE");

        AccountSyncStatus status = statuses.statusOf(account);

        assertThat(status.push()).isEqualTo("FAILED");
        assertThat(status.failing()).isTrue();
    }

    private void importDone() {
        checkpoints.start(account, "ALL", null);
        checkpoints.advance(account, "page-1", 0, 0, true);
    }

}
