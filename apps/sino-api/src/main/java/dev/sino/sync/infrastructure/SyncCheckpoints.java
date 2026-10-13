package dev.sino.sync.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Table {@code sync_checkpoint} (BE-45, BE-48, BE-51): one row per account, written by the import, by the syncs that
 * keep the account up to date afterwards, and by the registration of its watch. Every write is a single statement, so
 * two requests to start an import cannot both win, and a sync never writes over an import that started meanwhile.
 */
@Repository
public class SyncCheckpoints {

    private static final String RESUME = "s.import_status = 'FAILED' AND s.import_range = EXCLUDED.import_range";

    private final JdbcClient jdbc;

    SyncCheckpoints(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Checkpoint> find(UUID accountId) {
        // Whether the watch is on, by the clock dueForSync uses for the same question.
        return jdbc.sql("""
                SELECT *, coalesce(watch_expires_at > now(), false) AS watch_on
                FROM sync_checkpoint WHERE account_id = :account
                """).param("account", accountId).query((row, n) -> checkpoint(row)).optional();
    }

    /**
     * Marks the import of the account running and says so, unless it already runs: then nothing changes and the
     * result is false. An import that failed with the same range goes on from its cursor and counts; any other one
     * starts over from {@code since} ({@code null}: the whole mailbox).
     */
    public boolean start(UUID accountId, String range, Instant since) {
        return jdbc.sql("""
                INSERT INTO sync_checkpoint AS s (account_id, cursor, import_status, import_range, import_since,
                                                  imported_count, skipped_count, run_imported_count, estimated_count,
                                                  last_started_at, last_error_code, updated_at)
                VALUES (:account, NULL, 'RUNNING', :range, :since, 0, 0, 0, NULL, now(), NULL, now())
                ON CONFLICT (account_id) DO UPDATE
                SET import_status = 'RUNNING',
                    cursor = CASE WHEN %1$s THEN s.cursor END,
                    import_since = CASE WHEN %1$s THEN s.import_since ELSE EXCLUDED.import_since END,
                    imported_count = CASE WHEN %1$s THEN s.imported_count ELSE 0 END,
                    skipped_count = CASE WHEN %1$s THEN s.skipped_count ELSE 0 END,
                    estimated_count = CASE WHEN %1$s THEN s.estimated_count END,
                    import_range = EXCLUDED.import_range,
                    run_imported_count = 0,
                    last_started_at = now(),
                    last_error_code = NULL,
                    last_sync_at = NULL,
                    last_sync_attempt_at = NULL,
                    last_sync_error = NULL,
                    updated_at = now()
                WHERE s.import_status <> 'RUNNING'
                RETURNING account_id
                """.formatted(RESUME))
                .param("account", accountId).param("range", range).param("since", at(since))
                .query(UUID.class).optional().isPresent();
    }

    /** A run of the import begins (a start, or going on after a restart): its speed is measured from now. */
    public void beginRun(UUID accountId) {
        jdbc.sql("""
                UPDATE sync_checkpoint SET run_imported_count = 0, run_started_at = now(), updated_at = now()
                WHERE account_id = :account AND import_status = 'RUNNING'
                """).param("account", accountId).update();
    }

    public void estimated(UUID accountId, long messages) {
        jdbc.sql("UPDATE sync_checkpoint SET estimated_count = :messages, updated_at = now()"
                + " WHERE account_id = :account").param("messages", messages).param("account", accountId).update();
    }

    /** After a page is stored, in its transaction: the cursor moves on, and the import is done after the last page. */
    public void advance(UUID accountId, String cursor, int imported, int skipped, boolean done) {
        jdbc.sql("""
                UPDATE sync_checkpoint
                SET cursor = :cursor,
                    imported_count = imported_count + :imported,
                    run_imported_count = run_imported_count + :imported,
                    skipped_count = skipped_count + :skipped,
                    import_status = CASE WHEN :done THEN 'DONE' ELSE import_status END,
                    last_success_at = CASE WHEN :done THEN now() ELSE last_success_at END,
                    updated_at = now()
                WHERE account_id = :account
                """).param("cursor", cursor).param("imported", imported).param("skipped", skipped)
                .param("done", done).param("account", accountId).update();
    }

    /** The next page of the running import is its first one again, from the same moment. */
    public void startOver(UUID accountId) {
        jdbc.sql("""
                UPDATE sync_checkpoint SET cursor = NULL, updated_at = now()
                WHERE account_id = :account AND import_status = 'RUNNING'
                """).param("account", accountId).update();
    }

    public void fail(UUID accountId, String errorCode) {
        jdbc.sql("""
                UPDATE sync_checkpoint SET import_status = 'FAILED', last_error_code = :code, updated_at = now()
                WHERE account_id = :account AND import_status = 'RUNNING'
                """).param("code", errorCode).param("account", accountId).update();
    }

    /** A sync of an imported account begins; false when the row is no longer DONE (an import started again). */
    public boolean beginSync(UUID accountId) {
        return jdbc.sql("""
                UPDATE sync_checkpoint SET last_sync_attempt_at = now(), updated_at = now()
                WHERE account_id = :account AND import_status = 'DONE'
                """).param("account", accountId).update() == 1;
    }

    /**
     * After a page of a sync is stored, in its transaction: the cursor moves on, and after the last page the sync is
     * recorded as successful, its last error gone. When an import started again meanwhile nothing is written and the
     * result is false; the caller rolls the page back.
     */
    public boolean advanceSync(UUID accountId, String cursor, boolean done) {
        return jdbc.sql("""
                UPDATE sync_checkpoint
                SET cursor = :cursor,
                    last_sync_at = CASE WHEN :done THEN now() ELSE last_sync_at END,
                    last_sync_attempt_at = CASE WHEN :done THEN now() ELSE last_sync_attempt_at END,
                    last_sync_error = CASE WHEN :done THEN NULL ELSE last_sync_error END,
                    updated_at = now()
                WHERE account_id = :account AND import_status = 'DONE'
                """).param("cursor", cursor).param("done", done).param("account", accountId).update() == 1;
    }

    /**
     * The sync failed; the import stays DONE, the next sync goes on from the cursor and is timed from now. Whether the
     * error is new (not the one the last sync failed with), or empty when the import started again meanwhile.
     */
    public Optional<Boolean> syncFailed(UUID accountId, String errorCode) {
        return jdbc.sql("""
                UPDATE sync_checkpoint s
                SET last_sync_error = :code, last_sync_attempt_at = now(), updated_at = now()
                FROM (SELECT last_sync_error FROM sync_checkpoint WHERE account_id = :account) AS previous
                WHERE s.account_id = :account AND s.import_status = 'DONE'
                RETURNING previous.last_sync_error IS DISTINCT FROM :code
                """).param("code", errorCode).param("account", accountId).query(Boolean.class).optional();
    }

    /**
     * The imported accounts whose last sync was tried longer ago than their interval, or that were never synced and
     * whose import ended longer ago: the ones automatic sync asks for again, the longest waiting first. The interval
     * is {@code fallback} while the account has a watch that is on and did not fail, since the provider's notices
     * bring its changes; {@code interval} otherwise.
     */
    public List<UUID> dueForSync(Duration interval, Duration fallback) {
        // The database's clock, which wrote both times: the clock of the JVM may differ from it.
        return jdbc.sql("""
                SELECT account_id FROM sync_checkpoint
                WHERE import_status = 'DONE'
                  AND coalesce(last_sync_attempt_at, last_success_at) < now() - make_interval(secs =>
                      CASE WHEN watch_expires_at > now() AND watch_error IS NULL THEN :fallback ELSE :seconds END)
                ORDER BY coalesce(last_sync_attempt_at, last_success_at)
                """).param("seconds", seconds(interval)).param("fallback", seconds(fallback)).query(UUID.class)
                .list();
    }

    /**
     * The imported accounts whose watch is missing, failed the last time, or ends within {@code renewBefore}: the
     * ones whose watch is registered again.
     */
    public List<UUID> dueForWatch(Duration renewBefore) {
        return jdbc.sql("""
                SELECT account_id FROM sync_checkpoint
                WHERE import_status = 'DONE'
                  AND (watch_expires_at IS NULL OR watch_error IS NOT NULL
                       OR watch_expires_at < now() + make_interval(secs => :seconds))
                ORDER BY watch_expires_at NULLS FIRST, account_id
                """).param("seconds", seconds(renewBefore)).query(UUID.class).list();
    }

    /** The watch of the account was registered: what its notices carry and until when; its last error is gone. */
    public void watched(UUID accountId, String address, Instant expiresAt) {
        jdbc.sql("""
                UPDATE sync_checkpoint
                SET watch_address = :address, watch_expires_at = :expires, watch_error = NULL, updated_at = now()
                WHERE account_id = :account
                """).param("address", address).param("expires", at(expiresAt)).param("account", accountId)
                .update();
    }

    /**
     * The registration of the watch failed; a watch still on keeps its end, the next check tries again. Whether the
     * error is new (not the one the last registration failed with), or empty when the account has no row.
     */
    public Optional<Boolean> watchFailed(UUID accountId, String errorCode) {
        // old: the row as this statement found it (PostgreSQL 18).
        return jdbc.sql("""
                UPDATE sync_checkpoint SET watch_error = :code, updated_at = now()
                WHERE account_id = :account
                RETURNING old.watch_error IS DISTINCT FROM :code
                """).param("code", errorCode).param("account", accountId).query(Boolean.class).optional();
    }

    /** The accounts whose watch was registered under this address, whatever its case (BE-52). */
    public List<UUID> watchedBy(String address) {
        return jdbc.sql("""
                SELECT account_id FROM sync_checkpoint
                WHERE watch_address IS NOT NULL AND lower(watch_address) = lower(:address)
                ORDER BY account_id
                """).param("address", address).query(UUID.class).list();
    }

    public List<UUID> running() {
        return jdbc.sql("SELECT account_id FROM sync_checkpoint WHERE import_status = 'RUNNING'").query(UUID.class)
                .list();
    }

    private static OffsetDateTime at(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }

    private static double seconds(Duration duration) {
        return duration.toMillis() / 1000.0;
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        OffsetDateTime value = row.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static Checkpoint checkpoint(ResultSet row) throws SQLException {
        return new Checkpoint(row.getObject("account_id", UUID.class), row.getString("cursor"),
                row.getString("import_status"), row.getString("import_range"), instant(row, "import_since"),
                row.getInt("imported_count"), row.getInt("skipped_count"), row.getInt("run_imported_count"),
                instant(row, "run_started_at"), row.getObject("estimated_count", Long.class),
                instant(row, "last_started_at"), instant(row, "last_success_at"), row.getString("last_error_code"),
                instant(row, "updated_at"), instant(row, "last_sync_at"), row.getString("last_sync_error"),
                instant(row, "watch_expires_at"), row.getString("watch_error"), row.getBoolean("watch_on"));
    }

    /**
     * One row of {@code sync_checkpoint}; {@code estimated} is null until the connector answered, {@code lastSyncAt}
     * and {@code lastSyncError} until a sync after the import ended, {@code watchExpiresAt} and {@code watchError}
     * until a watch was registered or failed to be. {@code watchOn}: the watch has not ended yet.
     */
    public record Checkpoint(UUID accountId, String cursor, String status, String range, Instant since, int imported,
            int skipped, int runImported, Instant runStartedAt, Long estimated, Instant lastStartedAt,
            Instant lastSuccessAt, String lastErrorCode, Instant updatedAt, Instant lastSyncAt, String lastSyncError,
            Instant watchExpiresAt, String watchError, boolean watchOn) {
    }

}
