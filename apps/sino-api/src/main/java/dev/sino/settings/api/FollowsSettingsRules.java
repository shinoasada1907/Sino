package dev.sino.settings.api;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * The {@link SettingsPatch} sets only settings that exist, each to a value it takes (D-401). Every broken rule is one
 * error on its own field: {@code theme}, {@code notifications.importantOnly}, or the unknown name itself.
 */
@Documented
@Constraint(validatedBy = SettingsRules.class)
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@interface FollowsSettingsRules {

    String message() default "the settings break a rule";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

}
