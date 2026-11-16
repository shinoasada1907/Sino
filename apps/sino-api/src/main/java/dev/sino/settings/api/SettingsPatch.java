package dev.sino.settings.api;

import com.fasterxml.jackson.annotation.JsonCreator;

import tools.jackson.databind.node.ObjectNode;

import dev.sino.settings.domain.SettingsChange;

/**
 * Body of {@code PATCH /api/settings} (D-402): a JSON Merge Patch over {@link SettingsResponse}. A field left out stays
 * as it is, {@code "quietHours": null} and {@code "defaultReminderMinutes": null} turn them off, and
 * {@code notifications} changes only the switches it names.
 * <p>
 * The body is kept as a JSON tree and not read into typed fields: a name the API does not know and a value of the wrong
 * kind are then told field by field as {@code 400 VALIDATION_FAILED} ({@link FollowsSettingsRules}), where typed fields
 * would drop an unknown name without a word and turn a wrong kind into unreadable JSON. A body that is not a JSON
 * object cannot be read at all ({@code 400 MALFORMED_REQUEST}).
 */
@FollowsSettingsRules
record SettingsPatch(ObjectNode fields) {

    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    SettingsPatch {
    }

    /** Only once the body follows the rules, as {@code @Valid} makes sure before the controller runs. */
    SettingsChange toChange() {
        SettingsPatchReader.Result read = SettingsPatchReader.read(fields);
        if (!read.violations().isEmpty()) {
            throw new IllegalStateException("The settings patch was not validated: " + read.violations());
        }
        return read.change();
    }

}
