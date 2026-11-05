package dev.sino.identity.api;

import java.util.function.BiConsumer;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import dev.sino.identity.infrastructure.AppUser;

/**
 * Asks {@link AppUser#updateProfile} about each field the request gives, so the limits live in one place and the 400
 * can name the field. A scratch user takes the value, so nothing real is touched. The messages of the entity hold no
 * text of the user, so they are safe to use as a message template.
 */
class ProfileRules implements ConstraintValidator<ValidProfileChange, UpdateProfileRequest> {

    @Override
    public boolean isValid(UpdateProfileRequest request, ConstraintValidatorContext context) {
        if (request == null) {
            return true;
        }
        context.disableDefaultConstraintViolation();
        boolean valid = true;
        for (String name : request.unknownFields()) {
            valid = false;
            report(context, name, "unknown field");
        }
        valid &= check(context, "displayName", request.displayName(),
                (user, value) -> user.updateProfile(value, null, null, null, null));
        valid &= check(context, "phoneNumber", request.phoneNumber(),
                (user, value) -> user.updateProfile("x", value, null, null, null));
        valid &= check(context, "jobTitle", request.jobTitle(),
                (user, value) -> user.updateProfile("x", null, value, null, null));
        valid &= check(context, "location", request.location(),
                (user, value) -> user.updateProfile("x", null, null, value, null));
        valid &= check(context, "bio", request.bio(),
                (user, value) -> user.updateProfile("x", null, null, null, value));
        return valid;
    }

    private static boolean check(ConstraintValidatorContext context, String field, String value,
            BiConsumer<AppUser, String> trial) {
        if (value == null) {
            return true;
        }
        try {
            trial.accept(new AppUser("scratch@sino.invalid", "x"), value);
            return true;
        } catch (IllegalArgumentException broken) {
            report(context, field, broken.getMessage());
            return false;
        }
    }

    private static void report(ConstraintValidatorContext context, String field, String message) {
        context.buildConstraintViolationWithTemplate(message).addPropertyNode(field).addConstraintViolation();
    }

}
