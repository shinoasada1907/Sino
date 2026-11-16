package dev.sino.identity.api;

import java.io.IOException;
import java.io.UncheckedIOException;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import org.springframework.web.multipart.MultipartFile;

import dev.sino.identity.application.AvatarImage;

/**
 * Reads the head of the file with {@link AvatarImage} and reports why it is refused. The messages hold no text of the
 * file, so they are safe to use as a message template.
 */
class AvatarFileRules implements ConstraintValidator<ValidAvatarFile, MultipartFile> {

    @Override
    public boolean isValid(MultipartFile file, ConstraintValidatorContext context) {
        if (file == null || file.getSize() > AvatarImage.MAX_BYTES) {
            return true;
        }
        try {
            AvatarImage.read(file.getBytes());
            return true;
        } catch (IllegalArgumentException refused) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(refused.getMessage()).addConstraintViolation();
            return false;
        } catch (IOException e) {
            throw new UncheckedIOException("The upload could not be read.", e);
        }
    }

}
