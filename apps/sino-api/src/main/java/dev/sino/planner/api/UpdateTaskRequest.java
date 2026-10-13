package dev.sino.planner.api;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import dev.sino.planner.domain.Task;

/**
 * Body of {@code PATCH /api/tasks/{id}}: {@code title} and {@code notes}; a missing or {@code null} field stays as it
 * is, an empty {@code notes} removes the notes. At least one field must be given. The due and the rule change through
 * {@code PUT …/schedule} (D-153).
 */
record UpdateTaskRequest(
        @Size(max = Task.MAX_TITLE_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String title,
        @Size(max = Task.MAX_NOTES_LENGTH)
        @Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE) String notes) {

    @AssertTrue(message = "give at least one of title, notes")
    boolean isAnyFieldGiven() {
        return title != null || notes != null;
    }

    @AssertTrue(message = "title must not be blank")
    boolean isTitleNotBlankWhenGiven() {
        return title == null || !title.isBlank();
    }

}
