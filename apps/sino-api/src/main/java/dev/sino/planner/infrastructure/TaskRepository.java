package dev.sino.planner.infrastructure;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import dev.sino.planner.domain.Task;

public interface TaskRepository extends JpaRepository<Task, UUID> {

    Optional<Task> findByIdAndOwnerId(UUID id, UUID ownerId);

    /** The open tasks of a user and those done since {@code doneSince}, oldest first. */
    @Query("""
            select t from Task t
            where t.ownerId = :owner
              and (t.status = dev.sino.planner.domain.TaskStatus.OPEN
                   or (t.status = dev.sino.planner.domain.TaskStatus.DONE and t.completedAt >= :doneSince))
            order by t.createdAt, t.id""")
    List<Task> findCurrent(@Param("owner") UUID ownerId, @Param("doneSince") Instant doneSince);

    /** The tasks of a user, open or done, due in [from, to): a moment in [fromAt, toAt) or a day in [from, to). */
    @Query("""
            select t from Task t
            where t.ownerId = :owner
              and ((t.dueAt >= :fromAt and t.dueAt < :toAt) or (t.dueDate >= :from and t.dueDate < :to))""")
    List<Task> findDueBetween(@Param("owner") UUID ownerId, @Param("fromAt") Instant fromAt,
            @Param("toAt") Instant toAt, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** The open tasks of a user whose due is before {@code from}: a moment before {@code fromAt} or an earlier day. */
    @Query("""
            select t from Task t
            where t.ownerId = :owner
              and t.status = dev.sino.planner.domain.TaskStatus.OPEN
              and (t.dueAt < :fromAt or t.dueDate < :from)""")
    List<Task> findOpenDueBefore(@Param("owner") UUID ownerId, @Param("fromAt") Instant fromAt,
            @Param("from") LocalDate from);

    /** The open tasks of a user that repeat: each stands for the occurrences after its own due. */
    @Query("""
            select t from Task t
            where t.ownerId = :owner
              and t.status = dev.sino.planner.domain.TaskStatus.OPEN
              and t.recurrence.frequency is not null""")
    List<Task> findOpenRepeating(@Param("owner") UUID ownerId);

}
