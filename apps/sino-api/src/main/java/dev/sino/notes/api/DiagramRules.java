package dev.sino.notes.api;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Asks the domain whether a {@link DiagramBody} is a {@code Diagram}, so the rules live in one place and the 400 can
 * name the rule that was broken. The messages of the domain are ours and hold no text of the user, so they are safe to
 * use as a message template.
 */
class DiagramRules implements ConstraintValidator<FollowsDiagramRules, DiagramBody> {

    @Override
    public boolean isValid(DiagramBody body, ConstraintValidatorContext context) {
        if (body == null) {
            return true;
        }
        try {
            body.toDiagram();
            return true;
        } catch (NullPointerException missing) {
            // A field or a list is missing or null: @NotNull on the body names it.
            return true;
        } catch (IllegalArgumentException broken) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(broken.getMessage()).addConstraintViolation();
            return false;
        }
    }

}
