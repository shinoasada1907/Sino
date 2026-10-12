package dev.sino.planner.infrastructure;

import java.time.Instant;
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

}
