package dev.sino.common.web;

/**
 * Error codes produced by the web and security layers (F01 error code catalog). Module-specific codes live in
 * each module's {@link dev.sino.common.error.ErrorCode} enum.
 */
final class ProblemCodes {

    static final String VALIDATION_FAILED = "VALIDATION_FAILED";
    static final String MALFORMED_REQUEST = "MALFORMED_REQUEST";
    static final String UNAUTHORIZED = "UNAUTHORIZED";
    static final String FORBIDDEN = "FORBIDDEN";
    static final String RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND";
    static final String METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED";
    static final String UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE";
    static final String CONCURRENT_MODIFICATION = "CONCURRENT_MODIFICATION";
    static final String INTERNAL_ERROR = "INTERNAL_ERROR";

    private ProblemCodes() {
    }

}
