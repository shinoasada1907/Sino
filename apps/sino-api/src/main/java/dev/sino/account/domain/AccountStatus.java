package dev.sino.account.domain;

/**
 * Connection state of an account (D-12 A). "Syncing" is not a state: it is derived from a running sync (F07), so a
 * crash in the middle of a sync can never leave an account stuck.
 */
public enum AccountStatus {

    /** Working normally. */
    CONNECTED,

    /** Working with problems, for example a long rate limit. */
    DEGRADED,

    /** The provider no longer accepts the credentials; only a reconnect clears it. */
    AUTH_EXPIRED,

    /** Another failure. */
    ERROR,

    /** Turned off by the user: not synced and left out of the unified inbox. */
    DISABLED

}
