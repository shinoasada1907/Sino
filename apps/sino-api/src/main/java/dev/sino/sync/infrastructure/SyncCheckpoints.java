package dev.sino.sync.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Table {@code sync_checkpoint} (BE-45): one row per account, written by the import only. Every write is a single
 * statement, so two requests to start an import cannot both win.
 */
@Repository
public class SyncCheckpoints {

    private static final String RESUME = "s.import_status = 'FAILED' AND s.import_range = EXCLUDED.import_range";

    private final JdbcClient jdbc;

    SyncCheckpoints(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Checkpoint> find(UUID accountId) {
        return jdbc.sql("SELECT * FROM sync_checkpoint WHERE account_id = :account").param("account", accountId)
                .query((row, n) -> checkpoint(row)).optional();
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

    /** The next page is the first one again, from the same moment. */
    public void startOver(UUID accountId) {
        jdbc.sql("UPDATE sync_checkpoint SET cursor = NULL, updated_at = now() WHERE account_id = :account")
                .param("account", accountId).update();
    }

    public void fail(UUID accountId, String errorCode) {
        jdbc.sql("""
                UPDATE sync_checkpoint SET import_status = 'FAILED', last_error_code = :code, updated_at = now()
                WHERE account_id = :account AND import_status = 'RUNNING'
                """).param("code", errorCode).param("account", accountId).update();
    }

    public List<UUID> running() {
        return jdbc.sql("SELECT account_id FROM sync_checkpoint WHERE import_status = 'RUNNING'").query(UUID.class)
                .list();
    }

    private static OffsetDateTime at(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
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
                instant(row, "updated_at"));
    }

    /** One row of {@code sync_checkpoint}; {@code estimated} is null until the connector answered. */
    public record Checkpoint(UUID accountId, String cursor, String status, String range, Instant since, int imported,
            int skipped, int runImported, Instant runStartedAt, Long estimated, Instant lastStartedAt,
            Instant lastSuccessAt, String lastErrorCode, Instant updatedAt) {
    }

}
