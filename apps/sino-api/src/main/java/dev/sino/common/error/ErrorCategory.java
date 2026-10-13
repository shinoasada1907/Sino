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

    /** The provider failed while Sino acted on it for the caller, so the result could not be had (502). */
    PROVIDER_FAILED,

    /**
     * The provider took a change but gave no answer, so whether it made it is unknown; Sino finds out later rather
     * than trying again (504, F10).
     */
    PROVIDER_OUTCOME_UNKNOWN,

    /** Too many requests to us or to a provider (429). */
    RATE_LIMITED

}
