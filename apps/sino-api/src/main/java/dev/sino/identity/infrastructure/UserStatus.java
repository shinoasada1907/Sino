package dev.sino.identity.infrastructure;

/**
 * Whether a Sino user may use the application. Stored as text with a {@code CHECK} constraint (D-09).
 */
public enum UserStatus {

    ACTIVE,

    DISABLED

}
