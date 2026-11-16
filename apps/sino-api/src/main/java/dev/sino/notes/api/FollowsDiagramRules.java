package dev.sino.notes.api;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * The {@link DiagramBody} breaks no rule of {@code Diagram} (D-179): the limits, unique IDs, arrows that join two
 * different blocks of the diagram, one arrow per pair. The error says which rule. A missing field is not this
 * constraint's to report ({@code @NotNull} does).
 */
@Documented
@Constraint(validatedBy = DiagramRules.class)
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@interface FollowsDiagramRules {

    String message() default "the diagram breaks a rule of diagram notes";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

}
