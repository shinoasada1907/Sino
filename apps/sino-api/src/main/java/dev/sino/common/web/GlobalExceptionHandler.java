package dev.sino.common.web;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.SinoException;

/**
 * Turns every API failure into an RFC 9457 problem response with a stable {@code code} (D-21).
 * Spring MVC's own exceptions keep their standard status and detail; this class adds the code and, for
 * validation failures, the list of field errors. Security failures arrive here from {@code SecurityProblemHandler}.
 */
@RestControllerAdvice
class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(SinoException.class)
    ResponseEntity<ProblemDetail> handleSinoException(SinoException ex, HttpServletRequest request) {
        HttpStatus status = statusOf(ex.errorCode().category());
        return problem(status, ex.getMessage(), ex.errorCode().code(), request);
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ResponseEntity<ProblemDetail> handleOptimisticLocking(OptimisticLockingFailureException ex,
            HttpServletRequest request) {
        return problem(HttpStatus.CONFLICT, "The resource was changed by another request. Reload it and retry.",
                ProblemCodes.CONCURRENT_MODIFICATION, request);
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ProblemDetail> handleAuthentication(AuthenticationException ex, HttpServletRequest request) {
        return problem(HttpStatus.UNAUTHORIZED, "Authentication is required to access this resource.",
                ProblemCodes.UNAUTHORIZED, request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ProblemDetail> handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        return problem(HttpStatus.FORBIDDEN, "Access to this resource is denied.", ProblemCodes.FORBIDDEN, request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception ex, HttpServletRequest request) {
        // Full details stay in the server log; the client only gets a generic message.
        log.error("Unhandled exception for {} {}", request.getMethod(), request.getRequestURI(), ex);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred.", ProblemCodes.INTERNAL_ERROR,
                request);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> errors = new ArrayList<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            errors.add(new FieldViolation(error.getField(), error.getDefaultMessage()));
        }
        ex.getBindingResult().getGlobalErrors()
                .forEach(error -> errors.add(new FieldViolation(error.getObjectName(), error.getDefaultMessage())));
        return validationProblem(ex, errors, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> errors = new ArrayList<>();
        ex.getParameterValidationResults().forEach(result -> result.getResolvableErrors().forEach(error -> errors
                .add(new FieldViolation(result.getMethodParameter().getParameterName(), error.getDefaultMessage()))));
        return validationProblem(ex, errors, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
            HttpStatusCode statusCode, WebRequest request) {
        ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, statusCode, request);
        if (response != null && response.getBody() instanceof ProblemDetail problem) {
            if (problem.getProperties() == null || !problem.getProperties().containsKey("code")) {
                problem.setProperty("code", codeFor(ex, statusCode));
            }
            if (problem.getInstance() == null && request instanceof ServletWebRequest servletRequest) {
                problem.setInstance(URI.create(servletRequest.getRequest().getRequestURI()));
            }
        }
        return response;
    }

    private ResponseEntity<Object> validationProblem(Exception ex, List<FieldViolation> errors, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, "Request validation failed.");
        problem.setProperty("code", ProblemCodes.VALIDATION_FAILED);
        problem.setProperty("errors", errors);
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String detail, String code,
            HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("code", code);
        problem.setInstance(URI.create(request.getRequestURI()));
        return ResponseEntity.status(status).body(problem);
    }

    private static HttpStatus statusOf(ErrorCategory category) {
        return switch (category) {
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case CONFLICT -> HttpStatus.CONFLICT;
            case INVALID -> HttpStatus.UNPROCESSABLE_CONTENT;
            case DEPENDENCY_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
        };
    }

    private static String codeFor(Exception ex, HttpStatusCode status) {
        return switch (ex) {
            case HttpMessageNotReadableException e -> ProblemCodes.MALFORMED_REQUEST;
            case TypeMismatchException e -> ProblemCodes.MALFORMED_REQUEST;
            case ServletRequestBindingException e -> ProblemCodes.MALFORMED_REQUEST;
            case NoResourceFoundException e -> ProblemCodes.RESOURCE_NOT_FOUND;
            case NoHandlerFoundException e -> ProblemCodes.RESOURCE_NOT_FOUND;
            case HttpRequestMethodNotSupportedException e -> ProblemCodes.METHOD_NOT_ALLOWED;
            case HttpMediaTypeNotSupportedException e -> ProblemCodes.UNSUPPORTED_MEDIA_TYPE;
            default -> {
                // Unlisted Spring MVC errors still get a code derived from their status, e.g. NOT_ACCEPTABLE.
                HttpStatus known = HttpStatus.resolve(status.value());
                yield known != null ? known.name() : "HTTP_" + status.value();
            }
        };
    }

    /** One entry of the {@code errors} property of a validation problem. */
    record FieldViolation(String field, String message) {
    }

}
