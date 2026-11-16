package dev.sino.planner.infrastructure;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import dev.sino.planner.domain.CalendarEvent;

public interface CalendarEventRepository extends JpaRepository<CalendarEvent, UUID> {

    Optional<CalendarEvent> findByIdAndOwnerId(UUID id, UUID ownerId);

    /**
     * The appointments of a user that do not repeat and meet the range: a timed one that starts before {@code toAt}
     * and ends after {@code fromAt}, a whole-day one that starts before {@code to} and ends after {@code from}.
     */
    @Query("""
            select e from CalendarEvent e
            where e.ownerId = :owner
              and e.recurrence.frequency is null
              and ((e.startsAt < :toAt and e.endsAt > :fromAt) or (e.startDate < :to and e.endDate > :from))""")
    List<CalendarEvent> findSingleOverlapping(@Param("owner") UUID ownerId, @Param("fromAt") Instant fromAt,
            @Param("toAt") Instant toAt, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * The repeating appointments of a user whose first occurrence starts before the end of the range; the calendar
     * works out which of their occurrences meet it.
     */
    @Query("""
            select e from CalendarEvent e
            where e.ownerId = :owner
              and e.recurrence.frequency is not null
              and (e.startsAt < :toAt or e.startDate < :to)""")
    List<CalendarEvent> findRepeatingStartedBefore(@Param("owner") UUID ownerId, @Param("toAt") Instant toAt,
            @Param("to") LocalDate to);

}
