package dev.sino.identity.api;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * An {@link UpdateProfileRequest} gives only known fields, and each value keeps the limits of the profile. The error
 * names the field.
 */
@Documented
@Constraint(validatedBy = ProfileRules.class)
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@interface ValidProfileChange {

    String message() default "the profile change is not valid";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

}
