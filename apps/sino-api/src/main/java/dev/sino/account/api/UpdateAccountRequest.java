package dev.sino.account.api;

import jakarta.validation.constraints.AssertTrue;

import dev.sino.account.application.UpdateAccountCommand;

/**
 * Body of {@code PATCH /api/accounts/{id}}. Every field is optional; a missing field and a {@code null} field both
 * mean "leave it as it is". At least one field must be given.
 */
record UpdateAccountRequest(@ValidDisplayName String displayName, Boolean syncEnabled, Boolean enabled) {

    @AssertTrue(message = "give at least one of displayName, syncEnabled, enabled")
    boolean isAnyFieldGiven() {
        return displayName != null || syncEnabled != null || enabled != null;
    }

    UpdateAccountCommand toCommand() {
        return new UpdateAccountCommand(displayName, syncEnabled, enabled);
    }

}
