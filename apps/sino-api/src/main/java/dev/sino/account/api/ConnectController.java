package dev.sino.account.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.WebUtils;

import dev.sino.account.application.ConnectService;
import dev.sino.account.application.PendingConnect;
import dev.sino.identity.CurrentUser;

/**
 * Connecting an account over OAuth2 (F04a, C5). Starting hands the browser the provider's consent address and keeps
 * what the callback needs in the session of that browser.
 */
@RestController
@RequestMapping("/api/accounts/connect")
class ConnectController {

    private final ConnectService connect;
    private final CurrentUser currentUser;

    ConnectController(ConnectService connect, CurrentUser currentUser) {
        this.connect = connect;
        this.currentUser = currentUser;
    }

    /** No body, or no {@code accountId}, connects a new account; an {@code accountId} reconnects that one. */
    @PostMapping("/{provider}")
    ConnectResponse start(@PathVariable String provider, @RequestBody(required = false) ConnectRequest request,
            HttpServletRequest http) {
        PendingConnect pending = connect.start(currentUser.requireOwnerId(), provider,
                request == null ? null : request.accountId());
        HttpSession session = http.getSession();
        // Two tabs may start at once in one session.
        synchronized (WebUtils.getSessionMutex(session)) {
            PendingConnects connects = session.getAttribute(PendingConnects.SESSION_ATTRIBUTE)
                    instanceof PendingConnects existing ? existing : new PendingConnects();
            connects.add(pending);
            session.setAttribute(PendingConnects.SESSION_ATTRIBUTE, connects);
        }
        return new ConnectResponse(pending.authorizationUrl());
    }

}
