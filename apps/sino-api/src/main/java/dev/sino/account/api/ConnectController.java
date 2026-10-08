package dev.sino.account.api;

import java.net.URI;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.WebUtils;

import dev.sino.account.application.ConnectErrorCode;
import dev.sino.account.application.ConnectFailure;
import dev.sino.account.application.ConnectService;
import dev.sino.account.application.PendingConnect;
import dev.sino.identity.CurrentUser;

/**
 * Connecting an account over OAuth2 (F04a, C5). Starting hands the browser the provider's consent address and keeps
 * what the callback needs in the session of that browser; the callback finishes the connect and sends the browser
 * back to the web with the outcome.
 */
@RestController
@RequestMapping("/api/accounts/connect")
class ConnectController {

    private static final Logger LOG = LoggerFactory.getLogger(ConnectController.class);
    // Fixed addresses in the web app, never taken from the request: no open redirect.
    private static final String CONNECTED = "/accounts?connected=";
    private static final String CONNECT_ERROR = "/accounts?connectError=";

    private final ConnectService connect;
    private final CurrentUser currentUser;
    private final Clock clock;

    ConnectController(ConnectService connect, CurrentUser currentUser, Clock clock) {
        this.connect = connect;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    /** No body, or no {@code accountId}, connects a new account; an {@code accountId} reconnects that one. */
    @PostMapping("/{provider}")
    ConnectResponse start(@PathVariable String provider, @RequestBody(required = false) ConnectRequest request,
            HttpServletRequest http) {
        PendingConnect pending = connect.start(currentUser.requireOwnerId(), provider,
                request == null ? null : request.accountId());
        HttpSession session = http.getSession();
        // Two tabs may start at once in a session that has no pending connects yet.
        synchronized (WebUtils.getSessionMutex(session)) {
            PendingConnects connects = session.getAttribute(PendingConnects.SESSION_ATTRIBUTE)
                    instanceof PendingConnects existing ? existing : new PendingConnects();
            connects.add(pending);
            session.setAttribute(PendingConnects.SESSION_ATTRIBUTE, connects);
        }
        return new ConnectResponse(pending.authorizationUrl());
    }

    /**
     * Where the provider sends the browser back. Open at the security layer (the browser comes from the provider):
     * the pending connect in the session is what identifies the user, and it is taken before anything else, so a
     * state never works twice, whatever happens next.
     */
    @GetMapping("/{provider}/callback")
    ResponseEntity<Void> callback(@PathVariable String provider, @RequestParam(required = false) String code,
            @RequestParam(required = false) String state, @RequestParam(required = false) String error,
            HttpServletRequest http) {
        Optional<PendingConnect> pending = take(http.getSession(false), state)
                .filter(connect -> connect.provider().equals(provider));
        if (pending.isEmpty()) {
            return redirectTo(CONNECT_ERROR + ConnectErrorCode.CONNECT_STATE_INVALID);
        }
        try {
            UUID accountId = connect.complete(pending.get(), code, error);
            return redirectTo(CONNECTED + accountId);
        } catch (ConnectFailure failure) {
            return redirectTo(CONNECT_ERROR + failure.code());
        } catch (RuntimeException failure) {
            LOG.warn("Connecting {} failed: {}", pending.get().provider(), failure.getClass().getSimpleName());
            return redirectTo(CONNECT_ERROR + ConnectErrorCode.CONNECT_FAILED);
        }
    }

    private Optional<PendingConnect> take(HttpSession session, String state) {
        if (session == null) {
            return Optional.empty();
        }
        return session.getAttribute(PendingConnects.SESSION_ATTRIBUTE) instanceof PendingConnects connects
                ? connects.take(state, clock.instant()) : Optional.empty();
    }

    private static ResponseEntity<Void> redirectTo(String location) {
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(location)).build();
    }

}
