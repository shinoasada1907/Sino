package dev.sino.account.api;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import dev.sino.account.domain.ConnectedAccount;

/**
 * A display name chosen by the user, checked with the domain rule {@link ConnectedAccount#isValidDisplayName}: 1 to
 * 100 characters after trimming, counted like PostgreSQL counts them. {@code null} passes (the field was not
 * given). {@code @Size} would count Java chars instead, and an emoji is two of them.
 */
@Documented
@Constraint(validatedBy = ValidDisplayName.Validator.class)
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@interface ValidDisplayName {

    String message() default "must be 1 to 100 characters after trimming";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ValidDisplayName, String> {

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value == null || ConnectedAccount.isValidDisplayName(value);
        }

    }

}
