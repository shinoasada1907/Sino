package dev.sino.identity.api;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * The uploaded file is a PNG, JPEG or WebP by its first bytes and has no side above the limit. A file above the size
 * limit passes here and is refused by {@code ProfileService} as too large (413), because a constraint can only answer
 * 400.
 */
@Documented
@Constraint(validatedBy = AvatarFileRules.class)
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@interface ValidAvatarFile {

    String message() default "the picture is not valid";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

}
