package dev.sino.planner.infrastructure;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import dev.sino.planner.domain.ReminderKind;

/** Reads {@code reminder_delivery}, the table of the reminders that fired (RM-03 writes it). */
@Repository
public class ReminderDeliveries {

    private final JdbcClient jdbc;

    ReminderDeliveries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Whether the reminder of this occurrence has fired. */
    public boolean fired(UUID ownerId, ReminderKind kind, UUID itemId, LocalDate occurrenceDate) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM reminder_delivery
                               WHERE owner_id = :owner AND kind = :kind AND item_id = :item
                                 AND occurrence_date = :date)""")
                .param("owner", ownerId).param("kind", kind.name()).param("item", itemId)
                .param("date", occurrenceDate).query(Boolean.class).single();
    }

}
