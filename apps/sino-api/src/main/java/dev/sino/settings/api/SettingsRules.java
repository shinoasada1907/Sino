package dev.sino.settings.api;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.ConstraintValidatorContext.ConstraintViolationBuilder.NodeBuilderCustomizableContext;

/**
 * Checks {@link FollowsSettingsRules} by reading the patch with {@link SettingsPatchReader}. Each violation names its
 * field through property nodes, never through the message: a name sent by the client must not reach the message
 * template, which Bean Validation interpolates.
 */
class SettingsRules implements ConstraintValidator<FollowsSettingsRules, SettingsPatch> {

    @Override
    public boolean isValid(SettingsPatch patch, ConstraintValidatorContext context) {
        if (patch == null) {
            return true;
        }
        var violations = SettingsPatchReader.read(patch.fields()).violations();
        if (violations.isEmpty()) {
            return true;
        }
        context.disableDefaultConstraintViolation();
        for (SettingsPatchReader.Violation violation : violations) {
            var builder = context.buildConstraintViolationWithTemplate(violation.message());
            NodeBuilderCustomizableContext node = builder.addPropertyNode(violation.field());
            if (violation.part() != null) {
                node = node.addPropertyNode(violation.part());
            }
            node.addConstraintViolation();
        }
        return false;
    }

}
