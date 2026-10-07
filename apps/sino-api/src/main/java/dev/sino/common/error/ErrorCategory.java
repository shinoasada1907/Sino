package dev.sino.common.error;

/**
 * What kind of failure an {@link ErrorCode} describes. The web layer maps each category to an HTTP status,
 * so domain code never refers to HTTP.
 */
public enum ErrorCategory {

    /** The caller could not be identified, for example a failed sign-in (401). */
    UNAUTHENTICATED,

    /** The requested resource does not exist or is not visible to the caller (404). */
    NOT_FOUND,

    /** The request conflicts with the current state of the resource (409). */
    CONFLICT,

    /** The request is well-formed but breaks a business rule (422). */
    INVALID,

    /** A dependency such as a provider is temporarily unavailable (503). */
    DEPENDENCY_UNAVAILABLE,

    /** Too many requests to us or to a provider (429). */
    RATE_LIMITED

}
