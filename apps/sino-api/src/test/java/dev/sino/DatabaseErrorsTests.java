package dev.sino;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * An error of PostgreSQL never repeats the row it refused: its "Failing row contains (...)" detail would put the
 * text of a message into exceptions and logs (spec initial-sync, review BE-45).
 */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class DatabaseErrorsTests {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void aRefusedRowIsNotRepeatedInTheError() {
        Throwable failure = catchThrowable(() -> jdbc.update("""
                insert into conversation (account_id, external_conversation_id, type, title, last_message_at,
                                          created_at, updated_at)
                values (?, 'c-1', 'NOT_A_TYPE', ?, now(), now(), now())
                """, UUID.randomUUID(), "Lương tháng của chị Lan"));

        assertThat(failure).isNotNull();
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            assertThat(cause.getMessage()).doesNotContain("Lương tháng");
        }
    }

}
