package dev.sino.account.application;

/**
 * Changes the user asked for on one account. A {@code null} field is left unchanged.
 */
public record UpdateAccountCommand(String displayName, Boolean syncEnabled, Boolean enabled) {
}
