package dev.sino.account.application;

/**
 * Why a connect did not finish. The callback sends the browser back to the web with one of these as
 * {@code connectError}; it is never a Problem Details response, because the callback is a page change.
 */
public enum ConnectErrorCode {

    /** The user said no at the provider ({@code error=access_denied}). */
    CONNECT_CANCELLED,

    /** The state is missing, unknown, used, expired, of another provider, or the session is gone. */
    CONNECT_STATE_INVALID,

    /** The user did not grant a scope the connector needs. */
    CONNECT_SCOPE_DENIED,

    /** A reconnect came back with another account at the provider. */
    CONNECT_WRONG_ACCOUNT,

    /** Anything else: the provider failed, the code exchange failed, no refresh token, no profile. */
    CONNECT_FAILED

}
